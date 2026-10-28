-- Paid add-ons per event: photo frame, branding, 2-year storage, SMS alerts.

-- ---------------------------------------------------------------------------
-- Event flags and settings
-- ---------------------------------------------------------------------------
alter table public.events
  add column addon_frame boolean not null default false,
  add column addon_branding boolean not null default false,
  add column addon_storage boolean not null default false,
  add column addon_sms boolean not null default false,
  add column frame_text text check (char_length(frame_text) <= 40),
  add column frame_subtext text check (char_length(frame_subtext) <= 40),
  add column frame_color text not null default 'white' check (frame_color in ('white', 'cream', 'black')),
  add column brand_logo_path text check (brand_logo_path is null or brand_logo_path like id::text || '/brand/%');

-- Organisers edit the frame wording; flags and the logo path are set by the server.
grant insert (frame_text, frame_subtext, frame_color) on public.events to authenticated;
grant update (frame_text, frame_subtext, frame_color) on public.events to authenticated;

-- Keeping photos is now the paid 2-year add-on, so organisers can't switch on "keep forever".
revoke update (keep_photos) on public.events from authenticated;

-- ---------------------------------------------------------------------------
-- Payments: add-on purchases
-- ---------------------------------------------------------------------------
alter table public.payments drop constraint payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('plan', 'seats', 'addon'));
alter table public.payments add column addon text check (addon in ('frame', 'branding', 'storage', 'sms'));
alter table public.payments drop constraint payments_kind_shape;
alter table public.payments add constraint payments_kind_shape check (
  (kind = 'plan' and plan is not null and extra_guests = 0 and addon is null)
  or (kind = 'seats' and plan is null and extra_guests > 0 and addon is null)
  or (kind = 'addon' and plan is null and extra_guests = 0 and addon is not null)
);

create or replace function public.fulfil_payment(p_session_id text, p_payment_intent text, p_email text)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  rank_new int;
  rank_old int;
  e public.events;
  tiers text[] := array['free','small','party','big','unlimited'];
begin
  select * into pay from public.payments where stripe_session_id = p_session_id for update;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if pay.status = 'paid' then
    return pay;
  end if;

  update public.payments
     set status = 'paid', paid_at = now(),
         stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent),
         receipt_email = coalesce(p_email, receipt_email)
   where id = pay.id
  returning * into pay;

  if pay.event_id is not null then
    select * into e from public.events where id = pay.event_id for update;
    if pay.kind = 'seats' then
      update public.events
         set extra_guests = extra_guests + pay.extra_guests, full_notified_at = null
       where id = e.id;
    elsif pay.kind = 'addon' then
      update public.events
         set addon_frame = addon_frame or pay.addon = 'frame',
             addon_branding = addon_branding or pay.addon = 'branding',
             addon_storage = addon_storage or pay.addon = 'storage',
             addon_sms = addon_sms or pay.addon = 'sms',
             retention_warned_at = case when pay.addon = 'storage' then null else retention_warned_at end
       where id = e.id;
    else
      rank_new := array_position(tiers, pay.plan);
      rank_old := array_position(tiers, e.plan);
      if rank_new > rank_old then
        update public.events set plan = pay.plan, full_notified_at = null where id = e.id;
      end if;
    end if;
  end if;
  return pay;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention: 180 days, or 2 years with the storage add-on
-- ---------------------------------------------------------------------------
create or replace function public.event_retention_until(e public.events)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when e.keep_photos then null
    else coalesce(e.ended_at, (e.event_date + 1)::timestamptz, e.created_at)
         + case when e.addon_storage then interval '730 days' else interval '180 days' end
  end;
$$;

-- ---------------------------------------------------------------------------
-- SMS alerts
-- ---------------------------------------------------------------------------
create table public.guest_sms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  guest_id uuid references public.event_guests (id) on delete set null,
  -- E.164, for example +61412345678
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  sending_started_at timestamptz,
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text check (char_length(last_error) <= 500),
  view_token_hash text check (view_token_hash ~ '^[0-9a-f]{64}$'),
  unique (event_id, phone)
);
create index guest_sms_event_idx on public.guest_sms (event_id, created_at);
create index guest_sms_guest_idx on public.guest_sms (guest_id);
create unique index guest_sms_view_token_idx on public.guest_sms (view_token_hash) where view_token_hash is not null;

alter table public.guest_sms enable row level security;
revoke all on public.guest_sms from anon;
revoke insert, update on public.guest_sms from authenticated;
grant select, delete on public.guest_sms to authenticated;

create policy "guest sms: organiser read" on public.guest_sms
  for select to authenticated using (public.is_event_organiser(event_id));
create policy "guest sms: organiser delete" on public.guest_sms
  for delete to authenticated using (public.is_event_organiser(event_id));

-- Fair-use cap on texts per event (the price covers this many).
create function public.event_sms_cap(e public.events)
returns int
language sql
immutable
set search_path = ''
as $$
  select coalesce(public.plan_guest_limit(e.plan) + e.extra_guests, 1000);
$$;

create function public.add_guest_phone(p_guest_id uuid, p_phone text)
returns public.guest_sms
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.event_guests;
  e public.events;
  r public.guest_sms;
begin
  select * into g from public.event_guests where id = p_guest_id;
  if not found then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;
  if g.blocked then
    raise exception 'guest_blocked' using errcode = '42501';
  end if;
  select * into e from public.events where id = g.event_id for update;
  if not e.addon_sms or e.gallery_visibility = 'private' or e.suspended_at is not null then
    raise exception 'sms_disabled' using errcode = '42501';
  end if;
  if (select count(*) from public.guest_sms where guest_id = g.id) >= 2
     and not exists (select 1 from public.guest_sms where event_id = e.id and phone = p_phone) then
    raise exception 'too_many_numbers' using errcode = '22023';
  end if;
  if (select count(*) from public.guest_sms where event_id = e.id) >= public.event_sms_cap(e)
     and not exists (select 1 from public.guest_sms where event_id = e.id and phone = p_phone) then
    raise exception 'sms_full' using errcode = '53400';
  end if;

  insert into public.guest_sms (event_id, guest_id, phone)
  values (e.id, g.id, p_phone)
  on conflict (event_id, phone) do update
    set guest_id = coalesce(public.guest_sms.guest_id, excluded.guest_id),
        unsubscribed_at = null,
        attempts = case when public.guest_sms.sent_at is null then 0 else public.guest_sms.attempts end
  returning * into r;
  return r;
end;
$$;

create function public.claim_gallery_sms(p_event_id uuid, p_limit int)
returns table (id uuid, event_id uuid, phone text, event_code text, event_title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select s.id
    from public.guest_sms s
    join public.events e on e.id = s.event_id
    where (p_event_id is null or s.event_id = p_event_id)
      and s.sent_at is null
      and s.unsubscribed_at is null
      and s.attempts < 5
      and (s.sending_started_at is null or s.sending_started_at < now() - interval '10 minutes')
      and e.addon_sms
      and public.event_ready_for_email(e)
    order by s.created_at
    limit greatest(1, least(p_limit, 200))
    for update of s skip locked
  )
  update public.guest_sms gs
     set sending_started_at = now(), attempts = gs.attempts + 1
    from due, public.events ev
   where gs.id = due.id and ev.id = gs.event_id
  returning gs.id, gs.event_id, gs.phone, ev.code, ev.title;
end;
$$;

revoke execute on function public.add_guest_phone(uuid, text), public.claim_gallery_sms(uuid, int), public.event_sms_cap(public.events)
  from public, anon, authenticated;
grant execute on function public.add_guest_phone(uuid, text), public.claim_gallery_sms(uuid, int), public.event_sms_cap(public.events)
  to service_role;
