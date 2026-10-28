-- Audit fixes for payments.
-- Applied to the Lastshot project as migration "payment_hardening".

-- A payment can now be marked failed (async payment failed) and record refunds.
alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'paid', 'expired', 'refunded', 'failed'));
alter table public.payments
  add column refunded_cents int not null default 0 check (refunded_cents >= 0),
  -- What Stripe actually charged (amount_total), including any tax Stripe added.
  add column charged_cents int check (charged_cents >= 0),
  add column refunded_at timestamptz,
  add column disputed_at timestamptz;

-- Which payment a referral reward came from, so a refund can withdraw it.
alter table public.discount_codes add column source_payment_id uuid references public.payments (id) on delete set null;
create index if not exists discount_codes_source_payment_idx on public.discount_codes (source_payment_id);

create or replace function public.fulfil_payment(p_session_id text, p_payment_intent text, p_email text)
returns public.payments language plpgsql security definer set search_path = ''
as $$
declare
  pay public.payments;
  e public.events;
  dc public.discount_codes;
  tiers text[] := array['free','small','party','big','unlimited'];
  items text[];
begin
  select * into pay from public.payments where stripe_session_id = p_session_id for update;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  -- Only a pending payment can be fulfilled. A refunded, failed or expired one never is,
  -- even if Stripe resends the completed event or the success page is reloaded.
  if pay.status <> 'pending' then
    return pay;
  end if;

  update public.payments
     set status = 'paid', paid_at = now(),
         stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent),
         receipt_email = coalesce(p_email, receipt_email)
   where id = pay.id
  returning * into pay;

  if pay.discount_code_id is not null then
    update public.discount_codes set uses = uses + 1 where id = pay.discount_code_id returning * into dc;
    insert into public.discount_redemptions (code_id, user_id, payment_id) values (dc.id, pay.user_id, pay.id)
      on conflict (payment_id) do nothing;
    -- Referral rewards: at most 10 a year per referrer, so extra accounts can't farm them.
    if dc.kind = 'referral' and dc.owner_id is not null and dc.owner_id is distinct from pay.user_id
       and (select count(*) from public.discount_codes r
             where r.owner_id = dc.owner_id and r.kind = 'reward' and r.created_at > now() - interval '1 year') < 10 then
      insert into public.discount_codes (code, kind, percent_off, owner_id, max_uses, expires_at, source_payment_id)
      values (public.random_code('THANKS'), 'reward', dc.percent_off, dc.owner_id, 1, now() + interval '1 year', pay.id);
      update public.profiles set referred_by = coalesce(referred_by, dc.owner_id) where id = pay.user_id;
    end if;
  end if;

  if pay.kind = 'pack' then
    insert into public.event_credits (owner_id, pack, plan, branding, total, remaining, payment_id)
    values (pay.user_id, pay.pack, pay.pack_plan, pay.pack_branding, pay.pack_events, pay.pack_events, pay.id);
    return pay;
  end if;

  if pay.event_id is null then
    return pay;
  end if;
  select * into e from public.events where id = pay.event_id for update;

  if pay.extra_guests > 0 then
    update public.events set extra_guests = extra_guests + pay.extra_guests, full_notified_at = null where id = e.id;
  end if;

  if pay.plan is not null and array_position(tiers, pay.plan) > array_position(tiers, e.plan) then
    update public.events set plan = pay.plan, full_notified_at = null where id = e.id;
  end if;

  items := case when pay.kind = 'addon' then array[pay.addon] else pay.addons end;
  if cardinality(items) > 0 then
    update public.events
       set addon_frame = addon_frame or 'frame' = any(items),
           addon_branding = addon_branding or 'branding' = any(items),
           addon_storage = addon_storage or 'storage' = any(items),
           addon_storage_1y = addon_storage_1y or 'storage1y' = any(items),
           addon_sms = addon_sms or 'sms' = any(items),
           addon_link = addon_link or 'link' = any(items),
           addon_export = addon_export or 'export' = any(items),
           addon_setup = addon_setup or 'setup' = any(items),
           retention_warned_at = case when 'storage' = any(items) or 'storage1y' = any(items) then null else retention_warned_at end
     where id = e.id;
  end if;

  if pay.publish_on_paid and e.status = 'draft' and e.suspended_at is null then
    update public.events set status = 'published' where id = e.id;
  end if;
  return pay;
end;
$$;

-- Refund or dispute from Stripe. Records the amount. A full refund (or a dispute) also
-- takes back what hasn't been used yet: unused pack events and the referral reward it earned.
-- Plans and add-ons already on an event are left for an admin to adjust.
create function public.record_payment_refund(p_payment_intent text, p_refunded_cents int, p_full boolean, p_dispute boolean default false)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
begin
  select * into pay from public.payments where stripe_payment_intent = p_payment_intent for update;
  if not found then
    return null;
  end if;
  update public.payments
     set refunded_cents = greatest(refunded_cents, coalesce(p_refunded_cents, 0)),
         refunded_at = case when p_refunded_cents > 0 then coalesce(refunded_at, now()) else refunded_at end,
         disputed_at = case when p_dispute then coalesce(disputed_at, now()) else disputed_at end,
         status = case when p_full then 'refunded' else status end
   where id = pay.id
  returning * into pay;
  if p_full or p_dispute then
    update public.event_credits set remaining = 0 where payment_id = pay.id;
    update public.discount_codes set active = false where source_payment_id = pay.id and uses = 0;
  end if;
  return pay;
end;
$$;
revoke execute on function public.record_payment_refund(text, int, boolean, boolean) from public, anon, authenticated;
grant execute on function public.record_payment_refund(text, int, boolean, boolean) to service_role;
