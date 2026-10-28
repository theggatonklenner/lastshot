-- Adds the 50-guest Small plan and lowers Free to 10 guests.
-- Keep in sync with src/lib/plans.ts.
alter table public.events drop constraint events_plan_check;
alter table public.events add constraint events_plan_check check (plan in ('free', 'small', 'party', 'big', 'unlimited'));
alter table public.payments drop constraint payments_plan_check;
alter table public.payments add constraint payments_plan_check check (plan in ('small', 'party', 'big', 'unlimited'));

create or replace function public.plan_guest_limit(p_plan text)
returns int language sql immutable set search_path = '' as $$
  select case p_plan when 'free' then 10 when 'small' then 50 when 'party' then 100 when 'big' then 300 else null end;
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
    rank_new := array_position(tiers, pay.plan);
    rank_old := array_position(tiers, e.plan);
    if rank_new > rank_old then
      update public.events set plan = pay.plan, full_notified_at = null where id = e.id;
    end if;
  end if;
  return pay;
end;
$$;
