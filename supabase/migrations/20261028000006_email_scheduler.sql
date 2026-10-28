-- Every 5 minutes, ask the app to send any "photos are ready" emails that are due
-- (scheduled reveals). The app URL and shared secret live in Supabase Vault:
--   lastshot_cron_url    e.g. https://lastshot.vercel.app/api/cron/gallery-emails
--   lastshot_cron_secret same value as CRON_SECRET in Vercel
-- The job does nothing until both are set.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.trigger_gallery_email_sender()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'lastshot_cron_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'lastshot_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  -- Skip the call when nothing could possibly be due.
  if not exists (
    select 1 from public.guest_emails g join public.events e on e.id = g.event_id
    where g.sent_at is null and g.unsubscribed_at is null and g.attempts < 5
      and public.event_ready_for_email(e)
  ) then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke execute on function public.trigger_gallery_email_sender() from public, anon, authenticated;

select cron.schedule('lastshot-gallery-emails', '*/5 * * * *', $$select public.trigger_gallery_email_sender()$$);

-- Revision: the shared secret is optional. Without it the endpoint still only
-- sends emails that are already due, once each, and is rate limited.
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
  if not exists (
    select 1 from public.guest_emails g join public.events e on e.id = g.event_id
    where g.sent_at is null and g.unsubscribed_at is null and g.attempts < 5
      and public.event_ready_for_email(e)
  ) then
    return;
  end if;
  perform net.http_post(url := v_url, headers := v_headers, body := '{}'::jsonb, timeout_milliseconds := 55000);
end;
$$;
revoke execute on function public.trigger_gallery_email_sender() from public, anon, authenticated;
