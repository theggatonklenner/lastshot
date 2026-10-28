-- Photo reports, auto-clean retention, co-organisers, and an error log.

-- ===========================================================================
-- Co-organisers
-- ===========================================================================
create table public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_members_user_idx on public.event_members (user_id);

create table public.event_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  unique (event_id, email)
);
create index event_invites_event_idx on public.event_invites (event_id);

-- Owner or co-organiser of the event (the signed-in user).
create function public.is_event_organiser(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = p_event_id and e.owner_id = (select auth.uid()))
      or exists (select 1 from public.event_members m where m.event_id = p_event_id and m.user_id = (select auth.uid()));
$$;
revoke execute on function public.is_event_organiser(uuid) from public, anon;
grant execute on function public.is_event_organiser(uuid) to authenticated, service_role;

-- Events: co-organisers can read and update; only the owner can delete.
drop policy "events: owner read" on public.events;
drop policy "events: owner update" on public.events;
create policy "events: organiser read" on public.events
  for select to authenticated using (owner_id = (select auth.uid()) or public.is_event_organiser(id));
create policy "events: organiser update" on public.events
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_event_organiser(id))
  with check (owner_id = (select auth.uid()) or public.is_event_organiser(id));

drop policy "guests: owner read" on public.event_guests;
drop policy "guests: owner block" on public.event_guests;
create policy "guests: organiser read" on public.event_guests
  for select to authenticated using (public.is_event_organiser(event_id));
create policy "guests: organiser block" on public.event_guests
  for update to authenticated using (public.is_event_organiser(event_id));

drop policy "photos: owner read" on public.photos;
drop policy "photos: owner moderate" on public.photos;
drop policy "photos: owner delete" on public.photos;
create policy "photos: organiser read" on public.photos
  for select to authenticated using (public.is_event_organiser(event_id));
create policy "photos: organiser moderate" on public.photos
  for update to authenticated using (public.is_event_organiser(event_id));
create policy "photos: organiser delete" on public.photos
  for delete to authenticated using (public.is_event_organiser(event_id));

drop policy "settings: owner all" on public.event_settings;
create policy "settings: organiser all" on public.event_settings
  for all to authenticated
  using (public.is_event_organiser(event_id))
  with check (public.is_event_organiser(event_id));

drop policy "guest emails: owner read" on public.guest_emails;
drop policy "guest emails: owner delete" on public.guest_emails;
create policy "guest emails: organiser read" on public.guest_emails
  for select to authenticated using (public.is_event_organiser(event_id));
create policy "guest emails: organiser delete" on public.guest_emails
  for delete to authenticated using (public.is_event_organiser(event_id));

-- Team tables: organisers see the team; owner removes people; anyone can leave.
alter table public.event_members enable row level security;
alter table public.event_invites enable row level security;
revoke all on public.event_members, public.event_invites from anon;
revoke insert, update on public.event_members, public.event_invites from authenticated;

create policy "members: organiser read" on public.event_members
  for select to authenticated using (public.is_event_organiser(event_id));
create policy "members: owner removes or member leaves" on public.event_members
  for delete to authenticated using (
    user_id = (select auth.uid())
    or exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))
  );
create policy "invites: organiser read" on public.event_invites
  for select to authenticated using (public.is_event_organiser(event_id));
create policy "invites: owner cancel" on public.event_invites
  for delete to authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))
  );
-- Hide token hashes from clients entirely.
revoke select on public.event_invites from authenticated;
grant select (id, event_id, email, invited_by, created_at, expires_at, accepted_at, accepted_by) on public.event_invites to authenticated;

-- Access code: any organiser may set it.
create or replace function public.set_event_access_code(p_event_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_event_organiser(p_event_id) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  if p_code is null or btrim(p_code) = '' then
    update public.events set access_code_hash = null where id = p_event_id;
  else
    if char_length(btrim(p_code)) not between 4 and 32 then
      raise exception 'access code must be 4 to 32 characters' using errcode = '22023';
    end if;
    update public.events
       set access_code_hash = extensions.crypt(upper(btrim(p_code)), extensions.gen_salt('bf', 8))
     where id = p_event_id;
  end if;
end;
$$;

-- Accept an invite (server only, after checking the signed-in email matches).
create function public.accept_event_invite(p_token_hash text, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.event_invites;
  u_email text;
begin
  select * into i from public.event_invites where token_hash = p_token_hash for update;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if i.accepted_at is not null then
    if i.accepted_by = p_user_id then return i.event_id; end if;
    raise exception 'invite_used' using errcode = '22023';
  end if;
  if i.expires_at < now() then
    raise exception 'invite_expired' using errcode = '22023';
  end if;
  select lower(email) into u_email from public.profiles where id = p_user_id;
  if u_email is distinct from i.email then
    raise exception 'invite_wrong_account' using errcode = '42501';
  end if;
  insert into public.event_members (event_id, user_id, added_by)
  values (i.event_id, p_user_id, i.invited_by)
  on conflict do nothing;
  update public.event_invites set accepted_at = now(), accepted_by = p_user_id where id = i.id;
  return i.event_id;
end;
$$;
revoke execute on function public.accept_event_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.accept_event_invite(text, uuid) to service_role;

-- Dashboard stats include co-organised events (RLS already applies, invoker).

-- ===========================================================================
-- Photo reports
-- ===========================================================================
create table public.photo_reports (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  reporter_key text not null check (reporter_key ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('inappropriate', 'privacy', 'other')),
  details text check (char_length(details) <= 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (photo_id, reporter_key)
);
create index photo_reports_event_idx on public.photo_reports (event_id, created_at desc);

alter table public.photo_reports enable row level security;
revoke all on public.photo_reports from anon;
revoke insert, update, delete on public.photo_reports from authenticated;
grant update (resolved_at) on public.photo_reports to authenticated;
create policy "reports: organiser read" on public.photo_reports
  for select to authenticated using (public.is_event_organiser(event_id));
create policy "reports: organiser resolve" on public.photo_reports
  for update to authenticated using (public.is_event_organiser(event_id));

-- Guest or gallery-link holder reports a visible photo. Flags it; three
-- separate reports send it back to the review queue (hidden) automatically.
create function public.report_photo(p_photo_id uuid, p_event_id uuid, p_reporter_key text, p_reason text, p_details text)
returns table (first_report boolean, report_count int, hidden boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.photos;
  v_new boolean;
  v_count int;
  v_hidden boolean := false;
begin
  select * into p from public.photos where id = p_photo_id and event_id = p_event_id;
  if not found or p.upload_status <> 'complete' or p.moderation_status <> 'approved' then
    raise exception 'photo_not_found' using errcode = 'P0002';
  end if;

  insert into public.photo_reports (photo_id, event_id, reporter_key, reason, details)
  values (p.id, p.event_id, p_reporter_key, p_reason, nullif(btrim(left(p_details, 300)), ''))
  on conflict (photo_id, reporter_key) do nothing;
  v_new := found;

  select count(*) into v_count from public.photo_reports where photo_id = p.id and resolved_at is null;

  update public.photos
     set flagged = true,
         flag_reason = coalesce(flag_reason, 'Reported by a guest (' || p_reason || ')')
   where id = p.id;

  if v_count >= 3 then
    update public.photos set moderation_status = 'pending' where id = p.id;
    v_hidden := true;
  end if;

  return query select v_new and v_count = 1, v_count, v_hidden;
end;
$$;
revoke execute on function public.report_photo(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.report_photo(uuid, uuid, text, text, text) to service_role;

-- ===========================================================================
-- Retention (auto-clean)
-- ===========================================================================
alter table public.events
  add column keep_photos boolean not null default false,
  add column retention_warned_at timestamptz;
grant update (keep_photos) on public.events to authenticated;

-- Photos are kept 180 days after the event ends (or its date, or creation).
create function public.event_retention_until(e public.events)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when e.keep_photos then null
    else coalesce(e.ended_at, (e.event_date + 1)::timestamptz, e.created_at) + interval '180 days'
  end;
$$;

-- Events that should be cleaned up now: ended/archived past retention, or
-- drafts nobody ever published that are older than 180 days.
create function public.events_due_for_cleanup(p_limit int)
returns table (id uuid, owner_id uuid, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.owner_id, e.title
  from public.events e
  where not e.keep_photos
    and (
      (e.status in ('ended', 'archived') and public.event_retention_until(e) < now())
      or (e.status = 'draft' and e.created_at < now() - interval '180 days')
    )
  order by e.created_at
  limit greatest(1, least(p_limit, 50));
$$;

-- Events to warn about: due within 14 days and not yet warned.
create function public.events_due_for_retention_warning(p_limit int)
returns table (id uuid, owner_id uuid, title text, delete_after timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.owner_id, e.title, public.event_retention_until(e)
  from public.events e
  where not e.keep_photos
    and e.status in ('ended', 'archived')
    and e.retention_warned_at is null
    and public.event_retention_until(e) between now() and now() + interval '14 days'
    and exists (select 1 from public.photos p where p.event_id = e.id and p.upload_status = 'complete')
  order by public.event_retention_until(e)
  limit greatest(1, least(p_limit, 100));
$$;

revoke execute on function public.events_due_for_cleanup(int), public.events_due_for_retention_warning(int)
  from public, anon, authenticated;
grant execute on function public.events_due_for_cleanup(int), public.events_due_for_retention_warning(int)
  to service_role;
grant execute on function public.event_retention_until(public.events) to authenticated, service_role;

-- Reset the warning if the organiser reopens an event.
create or replace function public.events_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.published_at := null;
    new.ended_at := null;
    new.revealed_at := null;
    new.submissions_closed_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.code is distinct from old.code or new.owner_id is distinct from old.owner_id
     or new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'immutable event field' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status = 'published')
      or (old.status = 'published' and new.status in ('draft', 'active', 'ended'))
      or (old.status = 'active' and new.status = 'ended')
      or (old.status = 'ended' and new.status in ('active', 'archived'))
      or (old.status = 'archived' and new.status = 'ended')
    ) then
      raise exception 'invalid status change from % to %', old.status, new.status
        using errcode = '22023';
    end if;

    if old.status = 'published' and new.status = 'draft'
       and exists (select 1 from public.event_guests g where g.event_id = old.id) then
      raise exception 'cannot unpublish an event that guests have joined' using errcode = '22023';
    end if;

    if new.status = 'published' and old.status = 'draft' then
      new.published_at := now();
    end if;
    if new.status = 'ended' and old.status in ('published', 'active') then
      new.ended_at := now();
    end if;
    if new.status = 'active' and old.status = 'ended' then
      new.ended_at := null;
      new.retention_warned_at := null;
    end if;
  end if;

  if new.keep_photos and not old.keep_photos then
    new.retention_warned_at := null;
  end if;

  if new.status <> 'draft' and new.reveal_mode = 'scheduled' and new.reveal_at is null then
    raise exception 'scheduled reveal needs a reveal time' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ===========================================================================
-- Error log
-- ===========================================================================
create table public.app_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  source text not null check (source in ('server', 'client')),
  message text not null check (char_length(message) <= 1000),
  path text check (char_length(path) <= 500),
  digest text check (char_length(digest) <= 100),
  detail text check (char_length(detail) <= 4000),
  count int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  notified_at timestamptz,
  resolved_at timestamptz
);
create index app_errors_recent_idx on public.app_errors (last_seen_at desc);
alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;

-- Records an error; returns true when an alert email should go out
-- (first time, or again after a quiet hour).
create function public.log_app_error(
  p_fingerprint text, p_source text, p_message text, p_path text, p_digest text, p_detail text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.app_errors;
begin
  insert into public.app_errors as a (fingerprint, source, message, path, digest, detail)
  values (p_fingerprint, p_source, left(p_message, 1000), left(p_path, 500), left(p_digest, 100), left(p_detail, 4000))
  on conflict (fingerprint) do update
    set count = a.count + 1, last_seen_at = now(), path = excluded.path, digest = excluded.digest,
        resolved_at = null
  returning * into r;

  if r.notified_at is null or r.notified_at < now() - interval '1 hour' then
    update public.app_errors set notified_at = now() where id = r.id;
    return true;
  end if;
  return false;
end;
$$;
revoke execute on function public.log_app_error(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.log_app_error(text, text, text, text, text, text) to service_role;

-- ===========================================================================
-- Daily housekeeping job (warnings + cleanup), same pattern as the email sender.
-- Vault: lastshot_cleanup_url, optional lastshot_cron_secret.
-- ===========================================================================
create function public.trigger_cleanup_job()
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
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'lastshot_cleanup_url';
  if v_url is null then
    return;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'lastshot_cron_secret';
  if v_secret is not null then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_secret);
  end if;
  perform net.http_post(url := v_url, headers := v_headers, body := '{}'::jsonb, timeout_milliseconds := 55000);
end;
$$;
revoke execute on function public.trigger_cleanup_job() from public, anon, authenticated;

-- 3:17am Sydney is 16:17 UTC (daylight saving) / 17:17 UTC otherwise; 16:17 UTC is fine year round.
select cron.schedule('lastshot-cleanup', '17 16 * * *', $$select public.trigger_cleanup_job()$$);
