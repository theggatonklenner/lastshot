-- Web push "photos are ready" alerts, server secrets, and the save-the-date start time.
-- Applied to the Lastshot project as migration "push_and_save_the_date".

-- Server-only settings the app creates itself (e.g. the web push keys).
create table public.app_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

create table public.guest_push (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  guest_id uuid references public.event_guests (id) on delete cascade,
  endpoint text not null check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now(),
  sending_started_at timestamptz,
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text,
  unique (event_id, endpoint)
);
create index guest_push_due on public.guest_push (event_id) where sent_at is null;
alter table public.guest_push enable row level security;
revoke all on public.guest_push from anon, authenticated;

create function public.claim_gallery_push(p_event_id uuid, p_limit int)
returns table (id uuid, event_id uuid, endpoint text, p256dh text, auth text, event_code text, event_title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select p.id
    from public.guest_push p
    join public.events e on e.id = p.event_id
    where (p_event_id is null or p.event_id = p_event_id)
      and p.sent_at is null
      and p.attempts < 5
      and (p.sending_started_at is null or p.sending_started_at < now() - interval '10 minutes')
      and public.event_ready_for_email(e)
    order by p.created_at
    limit greatest(1, least(p_limit, 500))
    for update of p skip locked
  )
  update public.guest_push gp
     set sending_started_at = now(), attempts = gp.attempts + 1
    from due, public.events ev
   where gp.id = due.id and ev.id = gp.event_id
  returning gp.id, gp.event_id, gp.endpoint, gp.p256dh, gp.auth, ev.code, ev.title;
end;
$$;
revoke execute on function public.claim_gallery_push(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_gallery_push(uuid, int) to service_role;

-- Save the date: when the event starts (from its date, start time and time zone),
-- and an option to keep cameras locked until then.
alter table public.events
  add column starts_at timestamptz,
  add column lock_until_start boolean not null default false;
grant insert (lock_until_start), update (lock_until_start) on public.events to authenticated;

create function public.events_set_starts_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_date is not null and new.start_time is not null then
    new.starts_at := (new.event_date + new.start_time) at time zone coalesce(nullif(new.timezone, ''), 'Australia/Sydney');
  else
    new.starts_at := null;
  end if;
  return new;
end;
$$;
create trigger events_starts_at before insert or update of event_date, start_time, timezone on public.events
  for each row execute function public.events_set_starts_at();
update public.events set event_date = event_date where event_date is not null and start_time is not null;

create or replace function public.event_accepting_submissions(e public.events)
returns boolean
language sql
stable
set search_path = ''
as $$
  select e.status in ('published', 'active') and e.submissions_closed_at is null and e.suspended_at is null
    and not (e.lock_until_start and e.starts_at is not null and now() < e.starts_at);
$$;
