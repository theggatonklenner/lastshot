-- Extra seats: organisers buy packs of guests on top of their plan.
-- Applied to the Lastshot project as migration "extra_seats". See src/lib/plans.ts for pack size and price.

alter table public.events
  add column extra_guests int not null default 0 check (extra_guests between 0 and 100000);

alter table public.payments
  add column kind text not null default 'plan' check (kind in ('plan', 'seats')),
  add column extra_guests int not null default 0 check (extra_guests >= 0),
  alter column plan drop not null;
alter table public.payments add constraint payments_kind_shape check (
  (kind = 'plan' and plan is not null and extra_guests = 0)
  or (kind = 'seats' and plan is null and extra_guests > 0)
);

-- Guest limit for an event: its plan plus any extra seats bought. NULL = no limit.
create function public.event_guest_limit(e public.events)
returns int language sql stable set search_path = '' as $$
  select case when public.plan_guest_limit(e.plan) is null then null
              else public.plan_guest_limit(e.plan) + e.extra_guests end;
$$;
grant execute on function public.event_guest_limit(public.events) to authenticated, service_role;

-- guest_join now checks public.event_guest_limit(e) instead of plan_guest_limit(e.plan),
-- and fulfil_payment adds extra_guests for kind = 'seats'. Full bodies as applied:

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

  lim := public.event_guest_limit(e);
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
