-- Lastshot core schema
-- Organisers authenticate with Supabase Auth. Guests never talk to the database
-- directly: every guest action goes through a Next.js server route that verifies
-- the guest token and calls the service-role-only functions below.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.event_status as enum ('draft', 'published', 'active', 'ended', 'archived');
create type public.event_type as enum ('wedding', 'birthday', 'party', 'school', 'concert', 'corporate', 'other');
create type public.reveal_mode as enum ('live', 'scheduled', 'manual');
-- guests:  anyone who has joined the event on their device
-- public:  anyone with the event link, joined or not
-- private: organiser only (guests never see the gallery)
create type public.gallery_visibility as enum ('guests', 'public', 'private');
create type public.upload_status as enum ('pending', 'complete', 'failed');
create type public.moderation_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Profiles (the "users" table; one row per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create function public.generate_event_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  bytes bytea := extensions.gen_random_bytes(12);
  result text := '';
  i int;
begin
  -- 56-character alphabet without look-alike characters, 12 chars ~ 69 bits.
  for i in 0..11 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 56) + 1, 1);
  end loop;
  return result;
end;
$$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_event_code()
    check (code ~ '^[A-Za-z0-9]{12}$'),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (char_length(description) <= 1000),
  event_type public.event_type not null default 'party',
  cover_image_path text,
  event_date date,
  timezone text not null default 'Australia/Sydney' check (char_length(timezone) <= 64),
  start_time time,
  end_time time,
  status public.event_status not null default 'draft',
  photos_per_guest int not null default 12 check (photos_per_guest between 1 and 100),
  reveal_mode public.reveal_mode not null default 'live',
  reveal_at timestamptz,
  revealed_at timestamptz,
  gallery_visibility public.gallery_visibility not null default 'guests',
  guest_downloads_enabled boolean not null default true,
  camera_roll_uploads_enabled boolean not null default false,
  require_approval boolean not null default false,
  show_guest_names boolean not null default true,
  date_stamp_enabled boolean not null default true,
  access_code_hash text,
  theme text not null default 'classic' check (theme in ('classic', 'vintage', 'minimal', 'custom')),
  accent_color text not null default '#E8572A' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  submissions_closed_at timestamptz,
  published_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cover images can only live in this event's own folder, so a path can never
  -- be pointed at another event's files.
  constraint cover_path_scoped check (
    cover_image_path is null or cover_image_path like (id::text || '/%')
  )
);

create index events_owner_idx on public.events (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Guests
-- ---------------------------------------------------------------------------
create table public.event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  guest_token_hash text not null check (guest_token_hash ~ '^[0-9a-f]{64}$'),
  display_name text check (char_length(display_name) <= 40),
  -- Shots used. Counts every claimed slot (pending or complete). Released only
  -- when an upload fails. Deleting a photo does not refund the shot, the same
  -- way a real disposable camera doesn't.
  photos_submitted int not null default 0 check (photos_submitted >= 0),
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  unique (event_id, guest_token_hash)
);

create index event_guests_event_idx on public.event_guests (event_id, created_at desc);
create index event_guests_user_idx on public.event_guests (user_id);

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  guest_id uuid not null references public.event_guests (id) on delete cascade,
  client_upload_id uuid not null,
  storage_path text,
  display_path text,
  thumbnail_path text,
  upload_status public.upload_status not null default 'pending',
  moderation_status public.moderation_status not null default 'pending',
  flagged boolean not null default false,
  flag_reason text check (char_length(flag_reason) <= 200),
  source text not null default 'camera' check (source in ('camera', 'library')),
  captured_at timestamptz,
  uploaded_at timestamptz,
  width int check (width > 0),
  height int check (height > 0),
  file_size int check (file_size > 0),
  created_at timestamptz not null default now(),
  -- Retries reuse the same client_upload_id, so a retried upload can never
  -- become a second photo.
  unique (guest_id, client_upload_id),
  constraint photo_paths_scoped check (
    (storage_path is null or storage_path like (event_id::text || '/%'))
    and (display_path is null or display_path like (event_id::text || '/%'))
    and (thumbnail_path is null or thumbnail_path like (event_id::text || '/%'))
  ),
  constraint complete_has_paths check (
    upload_status <> 'complete'
    or (storage_path is not null and display_path is not null and thumbnail_path is not null)
  )
);

create index photos_event_created_idx on public.photos (event_id, created_at desc);
create index photos_event_visible_idx on public.photos (event_id, upload_status, moderation_status);
create index photos_guest_idx on public.photos (guest_id);

-- Guest's guest_id must belong to the same event as the photo.
create function public.photos_guest_matches_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.event_guests g where g.id = new.guest_id and g.event_id = new.event_id
  ) then
    raise exception 'guest does not belong to event' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger photos_guest_matches_event
  before insert or update of guest_id, event_id on public.photos
  for each row execute function public.photos_guest_matches_event();

-- ---------------------------------------------------------------------------
-- Extensible per-event settings (sign text, custom theme options, etc.)
-- ---------------------------------------------------------------------------
create table public.event_settings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  setting_key text not null check (setting_key ~ '^[a-z][a-z0-9_]{0,48}$'),
  setting_value jsonb not null default 'null'::jsonb,
  unique (event_id, setting_key)
);

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window counters, service role only)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
