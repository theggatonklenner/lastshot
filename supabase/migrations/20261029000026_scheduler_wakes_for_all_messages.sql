-- Audit fix: the 5-minute scheduler only called the app when an email was due, so
-- texts, push notifications and Event Wrapped emails could sit unsent. Wake it for any of them.
-- Applied to the Lastshot project as migration "scheduler_wakes_for_all_messages".
create or replace function public.trigger_gallery_email_sender()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'lastshot_cron_url';
  if v_url is null then
    return;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'lastshot_cron_secret';
  if v_secret is not null then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_secret);
  end if;
  if not (
    exists (
      select 1 from public.guest_emails g join public.events e on e.id = g.event_id
      where g.sent_at is null and g.unsubscribed_at is null and g.attempts < 5 and public.event_ready_for_email(e)
    )
    or exists (
      select 1 from public.guest_sms s join public.events e on e.id = s.event_id
      where s.sent_at is null and s.unsubscribed_at is null and s.attempts < 5 and e.addon_sms and public.event_ready_for_email(e)
    )
    or exists (
      select 1 from public.guest_push p join public.events e on e.id = p.event_id
      where p.sent_at is null and p.attempts < 5 and public.event_ready_for_email(e)
    )
    or exists (
      select 1 from public.events e
      where e.status in ('ended', 'archived') and e.wrapped_sent_at is null
        and e.ended_at between now() - interval '7 days' and now() - interval '6 hours'
    )
  ) then
    return;
  end if;
  perform net.http_post(url := v_url, headers := v_headers, body := '{}'::jsonb, timeout_milliseconds := 55000);
end;
$$;

-- Audit fix: organisers could point cover_image_path at any file in storage (it is signed
-- and shown back to them). Paths must live in the event's own folder.
alter table public.events add constraint events_cover_path_own_folder
  check (cover_image_path is null or (cover_image_path like id::text || '/cover/%' and cover_image_path !~ '\.\.'));
alter table public.events add constraint events_logo_path_own_folder
  check (brand_logo_path is null or (brand_logo_path like id::text || '/brand/%' and brand_logo_path !~ '\.\.'));
-- Only the server sets the cover path (after checking the organiser), never the browser.
revoke update (cover_image_path) on public.events from authenticated;

-- Least privilege: signed-in users never need TRUNCATE, TRIGGER or REFERENCES.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Advisor: evaluate auth.uid() once per query in these policies.
alter policy "own codes" on public.discount_codes using (owner_id = (select auth.uid()));
alter policy "own credits" on public.event_credits using (owner_id = (select auth.uid()));
alter policy "organisers read their event payments" on public.payments
  using ((user_id = (select auth.uid())) or ((event_id is not null) and public.is_event_organiser(event_id)));

-- Advisor: index foreign keys used for lookups and cascades.
create index if not exists credit_uses_credit_idx on public.credit_uses (credit_id);
create index if not exists credit_uses_event_idx on public.credit_uses (event_id);
create index if not exists discount_codes_partner_idx on public.discount_codes (partner_id);
create index if not exists discount_redemptions_code_idx on public.discount_redemptions (code_id);
create index if not exists discount_redemptions_user_idx on public.discount_redemptions (user_id);
create index if not exists event_credits_owner_idx on public.event_credits (owner_id);
create index if not exists event_credits_payment_idx on public.event_credits (payment_id);
create index if not exists guest_push_guest_idx on public.guest_push (guest_id);
create index if not exists marketing_contacts_event_idx on public.marketing_contacts (event_id);
create index if not exists payments_discount_code_idx on public.payments (discount_code_id);
create index if not exists payments_partner_idx on public.payments (partner_id);
create index if not exists profiles_partner_idx on public.profiles (partner_id);
create index if not exists profiles_referred_by_idx on public.profiles (referred_by);
create index if not exists event_invites_accepted_by_idx on public.event_invites (accepted_by);
create index if not exists event_invites_invited_by_idx on public.event_invites (invited_by);
create index if not exists event_members_added_by_idx on public.event_members (added_by);
