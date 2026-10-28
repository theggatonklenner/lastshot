-- Discount codes (referral, rewards, second event, partner, manual), bulk packs,
-- venue partners and custom event links.
-- Applied to the Lastshot project as migration "growth_codes_packs_partners_links".

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  name text not null check (char_length(name) between 1 and 80),
  blurb text check (char_length(blurb) <= 300),
  discount_percent int not null default 15 check (discount_percent between 0 and 50),
  revenue_share_percent int not null default 10 check (revenue_share_percent between 0 and 50),
  contact_email text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.partners enable row level security;
revoke all on public.partners from anon, authenticated;

alter table public.events
  add column addon_link boolean not null default false,
  add column custom_slug text unique check (custom_slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$');

alter table public.payments drop constraint payments_addon_check;
alter table public.payments add constraint payments_addon_check check (addon in ('frame', 'branding', 'storage', 'storage1y', 'sms', 'link'));
alter table public.payments drop constraint payments_addons_check;
alter table public.payments add constraint payments_addons_check
  check (addons <@ array['frame', 'branding', 'storage', 'storage1y', 'sms', 'link']::text[]);

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{4,24}$'),
  kind text not null check (kind in ('referral', 'reward', 'second_event', 'partner', 'manual')),
  percent_off int not null check (percent_off between 1 and 90),
  owner_id uuid references auth.users (id) on delete cascade,
  partner_id uuid references public.partners (id) on delete cascade,
  source_event_id uuid references public.events (id) on delete set null,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  first_order_only boolean not null default false,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index discount_codes_one_referral on public.discount_codes (owner_id) where kind = 'referral';
create unique index discount_codes_one_second_event on public.discount_codes (source_event_id) where kind = 'second_event';
alter table public.discount_codes enable row level security;
revoke all on public.discount_codes from anon, authenticated;
grant select on public.discount_codes to authenticated;
create policy "own codes" on public.discount_codes for select to authenticated using (owner_id = auth.uid());

create table public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.discount_codes (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  payment_id uuid not null unique references public.payments (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.discount_redemptions enable row level security;
revoke all on public.discount_redemptions from anon, authenticated;

alter table public.profiles
  add column partner_id uuid references public.partners (id) on delete set null,
  add column referred_by uuid references auth.users (id) on delete set null,
  add column brand_logo_path text check (brand_logo_path is null or brand_logo_path like 'accounts/%');

create table public.event_credits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  pack text not null,
  plan text not null check (plan in ('small', 'party', 'big', 'unlimited')),
  branding boolean not null default false,
  total int not null check (total > 0),
  remaining int not null check (remaining >= 0),
  payment_id uuid references public.payments (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.event_credits enable row level security;
revoke all on public.event_credits from anon, authenticated;
grant select on public.event_credits to authenticated;
create policy "own credits" on public.event_credits for select to authenticated using (owner_id = auth.uid());

create table public.credit_uses (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.event_credits (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.credit_uses enable row level security;
revoke all on public.credit_uses from anon, authenticated;

alter table public.payments
  add column subtotal_cents int,
  add column discount_cents int not null default 0 check (discount_cents >= 0),
  add column discount_code_id uuid references public.discount_codes (id) on delete set null,
  add column partner_id uuid references public.partners (id) on delete set null,
  add column pack text,
  add column pack_plan text check (pack_plan in ('small', 'party', 'big', 'unlimited')),
  add column pack_events int check (pack_events > 0),
  add column pack_branding boolean not null default false;
alter table public.payments drop constraint payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('plan', 'seats', 'addon', 'bundle', 'pack'));
alter table public.payments drop constraint payments_kind_shape;
alter table public.payments add constraint payments_kind_shape check (
  (kind = 'plan' and plan is not null and extra_guests = 0 and addon is null)
  or (kind = 'seats' and plan is null and extra_guests > 0 and addon is null)
  or (kind = 'addon' and plan is null and extra_guests = 0 and addon is not null)
  or (kind = 'bundle' and addon is null and (plan is not null or cardinality(addons) > 0 or extra_guests > 0))
  or (kind = 'pack' and pack is not null and pack_plan is not null and pack_events is not null and event_id is null)
);

create function public.random_code(p_prefix text)
returns text language sql volatile set search_path = ''
as $$
  select p_prefix || '-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

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
           retention_warned_at = case when 'storage' = any(items) or 'storage1y' = any(items) then null else retention_warned_at end
     where id = e.id;
  end if;

  if pay.publish_on_paid and e.status = 'draft' and e.suspended_at is null then
    update public.events set status = 'published' where id = e.id;
  end if;
  return pay;
end;
$$;

create function public.redeem_event_credit(p_credit_id uuid, p_event_id uuid, p_user_id uuid)
returns public.events language plpgsql security definer set search_path = ''
as $$
declare
  c public.event_credits;
  e public.events;
  tiers text[] := array['free','small','party','big','unlimited'];
begin
  select * into c from public.event_credits where id = p_credit_id for update;
  if not found or c.owner_id <> p_user_id then
    raise exception 'credit_not_found' using errcode = 'P0002';
  end if;
  if c.remaining < 1 then
    raise exception 'credit_used_up' using errcode = '22023';
  end if;
  select * into e from public.events where id = p_event_id for update;
  if not found or (e.owner_id <> p_user_id and not exists (
    select 1 from public.event_members m where m.event_id = e.id and m.user_id = p_user_id)) then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if array_position(tiers, c.plan) <= array_position(tiers, e.plan) and (not c.branding or e.addon_branding) then
    raise exception 'nothing_to_add' using errcode = '22023';
  end if;

  update public.event_credits set remaining = remaining - 1 where id = c.id;
  insert into public.credit_uses (credit_id, event_id) values (c.id, e.id);
  update public.events
     set plan = case when array_position(tiers, c.plan) > array_position(tiers, plan) then c.plan else plan end,
         addon_branding = addon_branding or c.branding,
         full_notified_at = null
   where id = e.id
  returning * into e;
  return e;
end;
$$;

create function public.create_second_event_code(p_event_id uuid)
returns public.discount_codes language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  d public.discount_codes;
begin
  select * into e from public.events where id = p_event_id;
  if not found or e.status not in ('ended', 'archived') then
    return null;
  end if;
  if not exists (select 1 from public.photos p where p.event_id = e.id and p.upload_status = 'complete') then
    return null;
  end if;
  insert into public.discount_codes (code, kind, percent_off, owner_id, source_event_id, max_uses, expires_at)
  values (public.random_code('NEXT'), 'second_event', 20, e.owner_id, e.id, 1, now() + interval '1 year')
  on conflict (source_event_id) where kind = 'second_event' do nothing
  returning * into d;
  return d;
end;
$$;

create function public.ensure_referral_code(p_user_id uuid)
returns public.discount_codes language plpgsql security definer set search_path = ''
as $$
declare
  d public.discount_codes;
begin
  select * into d from public.discount_codes where owner_id = p_user_id and kind = 'referral';
  if found then
    return d;
  end if;
  insert into public.discount_codes (code, kind, percent_off, owner_id, first_order_only)
  values (public.random_code('FRIEND'), 'referral', 15, p_user_id, true)
  on conflict do nothing
  returning * into d;
  if d.id is null then
    select * into d from public.discount_codes where owner_id = p_user_id and kind = 'referral';
  end if;
  return d;
end;
$$;

revoke execute on function public.redeem_event_credit(uuid, uuid, uuid), public.create_second_event_code(uuid),
  public.ensure_referral_code(uuid), public.random_code(text) from public, anon, authenticated;
grant execute on function public.redeem_event_credit(uuid, uuid, uuid), public.create_second_event_code(uuid),
  public.ensure_referral_code(uuid), public.random_code(text) to service_role;
