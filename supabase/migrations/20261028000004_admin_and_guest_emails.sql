-- Site admins, event suspension, and "email me when the gallery is ready".

-- ---------------------------------------------------------------------------
-- Site admins
-- ---------------------------------------------------------------------------
create table public.app_admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

insert into public.app_admins (email) values ('theggatonklenner@gmail.com');

alter table public.profiles add column is_admin boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, is_admin)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), ''),
    exists (select 1 from public.app_admins a where a.email = lower(new.email))
  );
  return new;
end;
$$;

-- True only for a confirmed account flagged as admin.
create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.is_admin
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = (select auth.uid()) and u.email_confirmed_at is not null
  ), false);
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Event additions
-- ---------------------------------------------------------------------------
alter table public.events
  add column suspended_at timestamptz,
  add column suspended_reason text check (char_length(suspended_reason) <= 300),
  add column email_capture_enabled boolean not null default true;

-- Organisers can toggle email capture but never lift a suspension.
grant insert (email_capture_enabled) on public.events to authenticated;
grant update (email_capture_enabled) on public.events to authenticated;

create or replace function public.event_accepting_submissions(e public.events)
returns boolean
language sql
stable
set search_path = ''
as $$
  select e.status in ('published', 'active') and e.submissions_closed_at is null and e.suspended_at is null;
$$;

-- Ready to email guests: the gallery is open to them and no more photos are coming
-- (or the organiser chose a scheduled or manual reveal, which marks the moment).
create function public.event_ready_for_email(e public.events)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.event_gallery_revealed(e)
    and e.gallery_visibility <> 'private'
    and e.suspended_at is null
    and e.status <> 'draft'
    and (e.status in ('ended', 'archived') or e.reveal_mode <> 'live');
$$;

-- guest_join: refuse suspended events.
create or replace function public.guest_join(
  p_event_id uuid,
  p_token_hash text,
  p_display_name text,
  p_access_code text
)
returns public.event_guests
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  g public.event_guests;
begin
  select * into e from public.events where id = p_event_id;
  if not found or e.status = 'draft' then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if e.suspended_at is not null then
    raise exception 'event_suspended' using errcode = '42501';
  end if;

  select * into g from public.event_guests
   where event_id = p_event_id and guest_token_hash = p_token_hash;

  if found then
    if g.blocked then
      raise exception 'guest_blocked' using errcode = '42501';
    end if;
    update public.event_guests
       set last_active_at = now(),
           display_name = coalesce(nullif(btrim(left(p_display_name, 40)), ''), display_name)
     where id = g.id
    returning * into g;
    return g;
  end if;

  if e.status not in ('published', 'active') then
    raise exception 'event_closed' using errcode = '22023';
  end if;

  if e.access_code_hash is not null and (
    p_access_code is null
    or e.access_code_hash <> extensions.crypt(upper(btrim(p_access_code)), e.access_code_hash)
  ) then
    raise exception 'access_code_invalid' using errcode = '28000';
  end if;

  insert into public.event_guests (event_id, guest_token_hash, display_name)
  values (p_event_id, p_token_hash, nullif(btrim(left(p_display_name, 40)), ''))
  on conflict (event_id, guest_token_hash) do update set last_active_at = now()
  returning * into g;

  return g;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guest emails
-- ---------------------------------------------------------------------------
create table public.guest_emails (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  guest_id uuid references public.event_guests (id) on delete set null,
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 254
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  sending_started_at timestamptz,
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text check (char_length(last_error) <= 500),
  -- Hash of the private gallery link sent in the email. The raw token exists only in the email.
  view_token_hash text check (view_token_hash ~ '^[0-9a-f]{64}$'),
  unique (event_id, email)
);
create index guest_emails_event_idx on public.guest_emails (event_id, created_at);
create index guest_emails_guest_idx on public.guest_emails (guest_id);
create index guest_emails_due_idx on public.guest_emails (event_id) where sent_at is null and unsubscribed_at is null;
create unique index guest_emails_view_token_idx on public.guest_emails (view_token_hash) where view_token_hash is not null;

alter table public.guest_emails enable row level security;
revoke all on public.guest_emails from anon;
revoke insert, update on public.guest_emails from authenticated;

create policy "guest emails: owner read" on public.guest_emails
  for select to authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))
  );
create policy "guest emails: owner delete" on public.guest_emails
  for delete to authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))
  );

-- Guest adds an email (server only). Re-adding a removed address re-subscribes it,
-- because it's an explicit new request. Three addresses per camera at most.
create function public.add_guest_email(p_guest_id uuid, p_email text)
returns public.guest_emails
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.event_guests;
  e public.events;
  r public.guest_emails;
  v_email text := lower(btrim(p_email));
begin
  select * into g from public.event_guests where id = p_guest_id;
  if not found then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;
  if g.blocked then
    raise exception 'guest_blocked' using errcode = '42501';
  end if;
  select * into e from public.events where id = g.event_id;
  if not e.email_capture_enabled or e.gallery_visibility = 'private' or e.suspended_at is not null then
    raise exception 'emails_disabled' using errcode = '42501';
  end if;
  if (select count(*) from public.guest_emails where guest_id = g.id) >= 3
     and not exists (select 1 from public.guest_emails where event_id = e.id and email = v_email) then
    raise exception 'too_many_emails' using errcode = '22023';
  end if;

  insert into public.guest_emails (event_id, guest_id, email)
  values (e.id, g.id, v_email)
  on conflict (event_id, email) do update
    set guest_id = coalesce(public.guest_emails.guest_id, excluded.guest_id),
        unsubscribed_at = null,
        attempts = case when public.guest_emails.sent_at is null then 0 else public.guest_emails.attempts end
  returning * into r;
  return r;
end;
$$;

-- Claims due emails so two senders can never email the same person twice.
create function public.claim_gallery_emails(p_event_id uuid, p_limit int)
returns table (id uuid, event_id uuid, email text, event_code text, event_title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select g.id
    from public.guest_emails g
    join public.events e on e.id = g.event_id
    where (p_event_id is null or g.event_id = p_event_id)
      and g.sent_at is null
      and g.unsubscribed_at is null
      and g.attempts < 5
      and (g.sending_started_at is null or g.sending_started_at < now() - interval '10 minutes')
      and public.event_ready_for_email(e)
    order by g.created_at
    limit greatest(1, least(p_limit, 200))
    for update of g skip locked
  )
  update public.guest_emails ge
     set sending_started_at = now(), attempts = ge.attempts + 1
    from due, public.events ev
   where ge.id = due.id and ev.id = ge.event_id
  returning ge.id, ge.event_id, ge.email, ev.code, ev.title;
end;
$$;

revoke execute on function
  public.add_guest_email(uuid, text),
  public.claim_gallery_emails(uuid, int),
  public.event_ready_for_email(public.events)
from public, anon, authenticated;
grant execute on function
  public.add_guest_email(uuid, text),
  public.claim_gallery_emails(uuid, int),
  public.event_ready_for_email(public.events)
to service_role;

-- Email counts for the organiser dashboard.
create function public.event_email_stats(p_event_id uuid)
returns table (subscribed int, sent int, waiting int, unsubscribed int, failed int)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where unsubscribed_at is null)::int,
    count(*) filter (where sent_at is not null)::int,
    count(*) filter (where sent_at is null and unsubscribed_at is null and attempts < 5)::int,
    count(*) filter (where unsubscribed_at is not null)::int,
    count(*) filter (where sent_at is null and attempts >= 5)::int
  from public.guest_emails
  where event_id = p_event_id;
$$;
revoke execute on function public.event_email_stats(uuid) from public, anon;
grant execute on function public.event_email_stats(uuid) to authenticated;
