-- 1-year storage option, and bundle payments (plan + add-ons in one checkout, used by the new-event setup).
-- Applied to the Lastshot project as migration "storage_1y_and_bundles".
alter table public.events add column addon_storage_1y boolean not null default false;

alter table public.payments drop constraint payments_addon_check;
alter table public.payments add constraint payments_addon_check check (addon in ('frame', 'branding', 'storage', 'storage1y', 'sms'));
alter table public.payments add column addons text[] not null default '{}'
  check (addons <@ array['frame', 'branding', 'storage', 'storage1y', 'sms']::text[]);
alter table public.payments drop constraint payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('plan', 'seats', 'addon', 'bundle'));
alter table public.payments drop constraint payments_kind_shape;
alter table public.payments add constraint payments_kind_shape check (
  (kind = 'plan' and plan is not null and extra_guests = 0 and addon is null)
  or (kind = 'seats' and plan is null and extra_guests > 0 and addon is null)
  or (kind = 'addon' and plan is null and extra_guests = 0 and addon is not null)
  or (kind = 'bundle' and addon is null and extra_guests = 0 and (plan is not null or cardinality(addons) > 0))
);

create or replace function public.fulfil_payment(p_session_id text, p_payment_intent text, p_email text)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  e public.events;
  tiers text[] := array['free','small','party','big','unlimited'];
  items text[];
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

  if pay.event_id is null then
    return pay;
  end if;
  select * into e from public.events where id = pay.event_id for update;

  if pay.kind = 'seats' then
    update public.events
       set extra_guests = extra_guests + pay.extra_guests, full_notified_at = null
     where id = e.id;
    return pay;
  end if;

  -- Plan part (plan or bundle). Never downgrades.
  if pay.plan is not null and array_position(tiers, pay.plan) > array_position(tiers, e.plan) then
    update public.events set plan = pay.plan, full_notified_at = null where id = e.id;
  end if;

  -- Add-on part (single add-on or bundle).
  items := case when pay.kind = 'addon' then array[pay.addon] else pay.addons end;
  if cardinality(items) > 0 then
    update public.events
       set addon_frame = addon_frame or 'frame' = any(items),
           addon_branding = addon_branding or 'branding' = any(items),
           addon_storage = addon_storage or 'storage' = any(items),
           addon_storage_1y = addon_storage_1y or 'storage1y' = any(items),
           addon_sms = addon_sms or 'sms' = any(items),
           retention_warned_at = case when 'storage' = any(items) or 'storage1y' = any(items) then null else retention_warned_at end
     where id = e.id;
  end if;
  return pay;
end;
$$;

create or replace function public.event_retention_until(e public.events)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when e.keep_photos then null
    else coalesce(e.ended_at, (e.event_date + 1)::timestamptz, e.created_at)
         + case when e.addon_storage then interval '730 days'
                when e.addon_storage_1y then interval '365 days'
                else interval '180 days' end
  end;
$$;
