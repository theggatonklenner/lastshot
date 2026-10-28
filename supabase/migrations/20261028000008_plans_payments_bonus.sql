-- Plans (guest limits), Stripe payments and bonus shots.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.events
  add column plan text not null default 'free'
    check (plan in ('free', 'party', 'big', 'unlimited')),
  add column full_notified_at timestamptz,
  add column bonus_shots int not null default 0 check (bonus_shots between 0 and 50),
  add column bonus_at timestamptz,
  add constraint events_bonus_needs_time check (bonus_shots = 0 or bonus_at is not null);

-- Events made before plans existed keep working without limits.
update public.events set plan = 'unlimited';

-- Organisers set bonus shots; only the server (Stripe, admins) sets the plan.
grant insert (bonus_shots, bonus_at) on public.events to authenticated;
grant update (bonus_shots, bonus_at) on public.events to authenticated;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

-- Keep in sync with src/lib/plans.ts. NULL means no limit.
create function public.plan_guest_limit(p_plan text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'free' then 20
    when 'party' then 100
    when 'big' then 300
    else null
  end;
$$;

-- Shots each guest gets right now, including bonus shots once unlocked.
create function public.event_shot_limit(e public.events)
returns int
language sql
stable
set search_path = ''
as $$
  select e.photos_per_guest
    + case when e.bonus_shots > 0 and e.bonus_at is not null and e.bonus_at <= now()
           then e.bonus_shots else 0 end;
$$;

grant execute on function public.plan_guest_limit(text) to authenticated, service_role;
grant execute on function public.event_shot_limit(public.events) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- guest_join: new guests are refused once the plan's guest limit is reached.
-- Guests who already joined always get back in.
-- ---------------------------------------------------------------------------
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
  lim int;
  n int;
begin
  -- Lock the event row so two guests can't both take the last place.
  select * into e from public.events where id = p_event_id for update;
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

  lim := public.plan_guest_limit(e.plan);
  if lim is not null then
    select count(*) into n from public.event_guests where event_id = e.id;
    if n >= lim then
      raise exception 'event_full' using errcode = '53400';
    end if;
  end if;

  insert into public.event_guests (event_id, guest_token_hash, display_name)
  values (p_event_id, p_token_hash, nullif(btrim(left(p_display_name, 40)), ''))
  on conflict (event_id, guest_token_hash) do update set last_active_at = now()
  returning * into g;

  return g;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_photo_slot: the shot limit includes unlocked bonus shots.
-- ---------------------------------------------------------------------------
create or replace function public.claim_photo_slot(
  p_guest_id uuid,
  p_client_upload_id uuid,
  p_captured_at timestamptz,
  p_source text
)
returns table (
  photo_id uuid,
  result text,
  shots_used int,
  shots_limit int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.event_guests;
  e public.events;
  p public.photos;
  lim int;
begin
  select * into g from public.event_guests where id = p_guest_id for update;
  if not found then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;
  if g.blocked then
    raise exception 'guest_blocked' using errcode = '42501';
  end if;

  select * into e from public.events where id = g.event_id;
  lim := public.event_shot_limit(e);

  perform public.release_stale_uploads(g.id);
  select * into g from public.event_guests where id = p_guest_id;

  select * into p from public.photos
   where guest_id = g.id and client_upload_id = p_client_upload_id;

  if found and p.upload_status = 'complete' then
    return query select p.id, 'duplicate'::text, g.photos_submitted, lim;
    return;
  end if;

  if found and p.upload_status = 'pending' then
    return query select p.id, 'resume'::text, g.photos_submitted, lim;
    return;
  end if;

  if not public.event_accepting_submissions(e) then
    raise exception 'event_closed' using errcode = '22023';
  end if;

  if p_source = 'library' and not e.camera_roll_uploads_enabled then
    raise exception 'library_disabled' using errcode = '42501';
  end if;

  if g.photos_submitted >= lim then
    raise exception 'limit_reached' using errcode = '22023';
  end if;

  if found then
    update public.photos
       set upload_status = 'pending', created_at = now(), captured_at = p_captured_at
     where id = p.id
    returning * into p;
  else
    insert into public.photos (event_id, guest_id, client_upload_id, captured_at, source)
    values (e.id, g.id, p_client_upload_id, p_captured_at,
            case when p_source = 'library' then 'library' else 'camera' end)
    returning * into p;
  end if;

  update public.event_guests
     set photos_submitted = photos_submitted + 1, last_active_at = now()
   where id = g.id
  returning * into g;

  if e.status = 'published' then
    update public.events set status = 'active' where id = e.id;
  end if;

  return query select p.id, 'claimed'::text, g.photos_submitted, lim;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  plan text not null check (plan in ('party', 'big', 'unlimited')),
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'aud',
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'refunded')),
  receipt_email text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_event_idx on public.payments (event_id, created_at desc);
create index payments_user_idx on public.payments (user_id, created_at desc);

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

create policy "organisers read their event payments"
  on public.payments for select to authenticated
  using (user_id = auth.uid() or (event_id is not null and public.is_event_organiser(event_id)));

-- Marks a Checkout session paid and upgrades the event. Safe to call twice
-- (the webhook and the success page both call it). Never downgrades.
create function public.fulfil_payment(p_session_id text, p_payment_intent text, p_email text)
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
    rank_new := array_position(array['free','party','big','unlimited'], pay.plan);
    rank_old := array_position(array['free','party','big','unlimited'], e.plan);
    if rank_new > rank_old then
      update public.events set plan = pay.plan, full_notified_at = null where id = e.id;
    end if;
  end if;
  return pay;
end;
$$;

revoke execute on function public.fulfil_payment(text, text, text) from public, anon, authenticated;
grant execute on function public.fulfil_payment(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Admin overview: add revenue.
-- ---------------------------------------------------------------------------
create function public.admin_revenue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'paid_events', (select count(distinct event_id) from public.payments where status = 'paid'),
    'revenue_cents', (select coalesce(sum(amount_cents), 0) from public.payments where status = 'paid'),
    'revenue_30d_cents', (select coalesce(sum(amount_cents), 0) from public.payments
                           where status = 'paid' and paid_at > now() - interval '30 days'),
    'by_plan', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb)
                  from (select plan, count(*) n from public.events group by plan) s)
  );
end;
$$;
revoke execute on function public.admin_revenue() from public, anon;
grant execute on function public.admin_revenue() to authenticated;
