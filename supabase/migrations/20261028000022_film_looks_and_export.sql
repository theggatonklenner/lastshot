-- Film roll picker (guests choose a look per shot) and the Data export add-on with lead questions.
-- Applied to the Lastshot project as migration "film_looks_and_export".

alter table public.events
  add column film_looks text[] not null default '{}'
    check (film_looks <@ array['classic', 'vintage', 'bw', 'warm', 'cool', 'faded', 'true']::text[] and cardinality(film_looks) <= 7),
  add column addon_export boolean not null default false,
  add column lead_questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(lead_questions) = 'array' and jsonb_array_length(lead_questions) <= 3);
grant insert (film_looks), update (film_looks) on public.events to authenticated;

alter table public.event_guests
  add column lead_answers jsonb not null default '{}'::jsonb check (jsonb_typeof(lead_answers) = 'object');

alter table public.payments drop constraint payments_addon_check;
alter table public.payments add constraint payments_addon_check
  check (addon in ('frame', 'branding', 'storage', 'storage1y', 'sms', 'link', 'export'));
alter table public.payments drop constraint payments_addons_check;
alter table public.payments add constraint payments_addons_check
  check (addons <@ array['frame', 'branding', 'storage', 'storage1y', 'sms', 'link', 'export']::text[]);

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
  if pay.status = 'paid' then
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
    if dc.kind = 'referral' and dc.owner_id is not null and dc.owner_id is distinct from pay.user_id then
      insert into public.discount_codes (code, kind, percent_off, owner_id, max_uses, expires_at)
      values (public.random_code('THANKS'), 'reward', dc.percent_off, dc.owner_id, 1, now() + interval '1 year');
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
           retention_warned_at = case when 'storage' = any(items) or 'storage1y' = any(items) then null else retention_warned_at end
     where id = e.id;
  end if;

  if pay.publish_on_paid and e.status = 'draft' and e.suspended_at is null then
    update public.events set status = 'published' where id = e.id;
  end if;
  return pay;
end;
$$;
