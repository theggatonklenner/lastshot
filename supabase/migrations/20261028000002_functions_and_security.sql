-- Lastshot: business rules, atomic guest operations, RLS and storage.

-- ---------------------------------------------------------------------------
-- Event lifecycle guard
-- ---------------------------------------------------------------------------
create function public.events_before_write()
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

    -- Unpublishing is only allowed before anyone has joined.
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
    end if;
  end if;

  if new.status <> 'draft' and new.reveal_mode = 'scheduled' and new.reveal_at is null then
    raise exception 'scheduled reveal needs a reveal time' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger events_before_write
  before insert or update on public.events
  for each row execute function public.events_before_write();

-- ---------------------------------------------------------------------------
-- Rules shared by server code and SQL
-- ---------------------------------------------------------------------------
create function public.event_gallery_revealed(e public.events)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case e.reveal_mode
    when 'live' then true
    when 'scheduled' then e.reveal_at is not null and now() >= e.reveal_at
    when 'manual' then e.revealed_at is not null
  end;
$$;

create function public.event_accepting_submissions(e public.events)
returns boolean
language sql
stable
set search_path = ''
as $$
  select e.status in ('published', 'active') and e.submissions_closed_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting: returns true when the call is allowed.
-- ---------------------------------------------------------------------------
create function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- Opportunistic cleanup of old windows.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guest join. Creates or resumes a guest identity for a token hash.
-- ---------------------------------------------------------------------------
create function public.guest_join(
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
begin
  select * into e from public.events where id = p_event_id;
  if not found or e.status = 'draft' then
    raise exception 'event_not_found' using errcode = 'P0002';
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

  insert into public.event_guests (event_id, guest_token_hash, display_name)
  values (p_event_id, p_token_hash, nullif(btrim(left(p_display_name, 40)), ''))
  on conflict (event_id, guest_token_hash) do update set last_active_at = now()
  returning * into g;

  return g;
end;
$$;

-- ---------------------------------------------------------------------------
-- Release abandoned uploads for one guest (pending for > 15 minutes).
-- ---------------------------------------------------------------------------
create function public.release_stale_uploads(p_guest_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released int;
begin
  with stale as (
    update public.photos
       set upload_status = 'failed'
     where guest_id = p_guest_id
       and upload_status = 'pending'
       and created_at < now() - interval '15 minutes'
    returning id
  )
  select count(*) into v_released from stale;

  if v_released > 0 then
    update public.event_guests
       set photos_submitted = greatest(photos_submitted - v_released, 0)
     where id = p_guest_id;
  end if;
  return v_released;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claim one shot. Atomic: locks the guest row so concurrent uploads from the
-- same guest are serialised and can never exceed the limit. Idempotent on
-- client_upload_id so retries never double count.
--
-- result values:
--   claimed   new slot reserved, upload the file
--   resume    slot already reserved by an earlier attempt, upload the file
--   duplicate this upload already completed, nothing to do
-- ---------------------------------------------------------------------------
create function public.claim_photo_slot(
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
begin
  select * into g from public.event_guests where id = p_guest_id for update;
  if not found then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;
  if g.blocked then
    raise exception 'guest_blocked' using errcode = '42501';
  end if;

  select * into e from public.events where id = g.event_id;

  perform public.release_stale_uploads(g.id);
  select * into g from public.event_guests where id = p_guest_id;

  select * into p from public.photos
   where guest_id = g.id and client_upload_id = p_client_upload_id;

  if found and p.upload_status = 'complete' then
    return query select p.id, 'duplicate'::text, g.photos_submitted, e.photos_per_guest;
    return;
  end if;

  if found and p.upload_status = 'pending' then
    return query select p.id, 'resume'::text, g.photos_submitted, e.photos_per_guest;
    return;
  end if;

  if not public.event_accepting_submissions(e) then
    raise exception 'event_closed' using errcode = '22023';
  end if;

  if p_source = 'library' and not e.camera_roll_uploads_enabled then
    raise exception 'library_disabled' using errcode = '42501';
  end if;

  if g.photos_submitted >= e.photos_per_guest then
    raise exception 'limit_reached' using errcode = '22023';
  end if;

  if found then
    -- A previous attempt failed and released its slot; take a new one.
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

  return query select p.id, 'claimed'::text, g.photos_submitted, e.photos_per_guest;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mark an upload complete once the files are safely in storage.
-- ---------------------------------------------------------------------------
create function public.complete_photo_upload(
  p_photo_id uuid,
  p_storage_path text,
  p_display_path text,
  p_thumbnail_path text,
  p_width int,
  p_height int,
  p_file_size int
)
returns public.photos
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.photos;
  e public.events;
begin
  select * into p from public.photos where id = p_photo_id for update;
  if not found then
    raise exception 'photo_not_found' using errcode = 'P0002';
  end if;
  if p.upload_status = 'complete' then
    return p;
  end if;
  if p.upload_status <> 'pending' then
    raise exception 'photo_not_pending' using errcode = '22023';
  end if;

  select * into e from public.events where id = p.event_id;

  update public.photos
     set upload_status = 'complete',
         uploaded_at = now(),
         storage_path = p_storage_path,
         display_path = p_display_path,
         thumbnail_path = p_thumbnail_path,
         width = p_width,
         height = p_height,
         file_size = p_file_size,
         moderation_status = case when e.require_approval then 'pending'::public.moderation_status
                                  else 'approved'::public.moderation_status end
   where id = p.id
  returning * into p;

  return p;
end;
$$;

-- ---------------------------------------------------------------------------
-- Give a slot back when the server could not store the file.
-- ---------------------------------------------------------------------------
create function public.release_photo_slot(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.photos;
begin
  select * into p from public.photos where id = p_photo_id for update;
  if not found or p.upload_status <> 'pending' then
    return;
  end if;
  update public.photos set upload_status = 'failed' where id = p.id;
  update public.event_guests
     set photos_submitted = greatest(photos_submitted - 1, 0)
   where id = p.guest_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organiser: set or clear the optional guest access code.
-- ---------------------------------------------------------------------------
create function public.set_event_access_code(p_event_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.events where id = p_event_id and owner_id = (select auth.uid())
  ) then
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

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.check_rate_limit(text, int, int),
  public.guest_join(uuid, text, text, text),
  public.release_stale_uploads(uuid),
  public.claim_photo_slot(uuid, uuid, timestamptz, text),
  public.complete_photo_upload(uuid, text, text, text, int, int, int),
  public.release_photo_slot(uuid),
  public.handle_new_user(),
  public.generate_event_code()
from public, anon, authenticated;

grant execute on function
  public.check_rate_limit(text, int, int),
  public.guest_join(uuid, text, text, text),
  public.release_stale_uploads(uuid),
  public.claim_photo_slot(uuid, uuid, timestamptz, text),
  public.complete_photo_upload(uuid, text, text, text, int, int, int),
  public.release_photo_slot(uuid),
  public.generate_event_code()
to service_role;

-- generate_event_code is the column default, so inserting roles need it.
grant execute on function public.generate_event_code() to authenticated;

revoke execute on function public.set_event_access_code(uuid, text) from public, anon;
grant execute on function public.set_event_access_code(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_guests enable row level security;
alter table public.photos enable row level security;
alter table public.event_settings enable row level security;
alter table public.rate_limits enable row level security;

-- The anon key gets nothing. Guests are served through server routes.
revoke all on public.profiles, public.events, public.event_guests, public.photos,
  public.event_settings, public.rate_limits from anon;
revoke all on public.rate_limits from authenticated;

-- Profiles
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Events
create policy "events: owner read" on public.events
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "events: owner insert" on public.events
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "events: owner update" on public.events
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "events: owner delete" on public.events
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke insert, update on public.events from authenticated;
grant insert (owner_id, title, description, event_type, event_date, timezone, start_time, end_time,
  photos_per_guest, reveal_mode, reveal_at, gallery_visibility, guest_downloads_enabled,
  camera_roll_uploads_enabled, require_approval, show_guest_names, date_stamp_enabled, theme,
  accent_color) on public.events to authenticated;
grant update (title, description, event_type, cover_image_path, event_date, timezone, start_time,
  end_time, status, photos_per_guest, reveal_mode, reveal_at, revealed_at, gallery_visibility,
  guest_downloads_enabled, camera_roll_uploads_enabled, require_approval, show_guest_names,
  date_stamp_enabled, theme, accent_color, submissions_closed_at) on public.events to authenticated;

-- Guests: organisers can see and block their guests; nothing else.
create policy "guests: owner read" on public.event_guests
  for select to authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))
  );
create policy "guests: owner block" on public.event_guests
  for update to authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))
  );
revoke insert, update, delete on public.event_guests from authenticated;
grant update (blocked) on public.event_guests to authenticated;

-- Photos: organisers read, moderate and delete. Uploads are server only.
create policy "photos: owner read" on public.photos
  for select to authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))
  );
create policy "photos: owner moderate" on public.photos
  for update to authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))
  );
create policy "photos: owner delete" on public.photos
  for delete to authenticated using (
    exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))
  );
revoke insert, update on public.photos from authenticated;
grant update (moderation_status, flagged, flag_reason) on public.photos to authenticated;

-- Event settings
create policy "settings: owner all" on public.event_settings
  for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Realtime for the organiser dashboard (RLS still applies)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.photos, public.event_guests;

-- ---------------------------------------------------------------------------
-- Storage: one private bucket. No storage policies, so only the server
-- (service role) can read or write objects. Clients get short-lived signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;
