-- Read functions for the site admin dashboard. Each checks is_platform_admin()
-- and returns nothing useful to anyone else.

create function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'organisers', (select count(*) from public.profiles),
    'signups_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'events', (select count(*) from public.events),
    'events_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.events group by status) s),
    'events_suspended', (select count(*) from public.events where suspended_at is not null),
    'guests', (select count(*) from public.event_guests),
    'photos', (select count(*) from public.photos where upload_status = 'complete'),
    'photos_24h', (select count(*) from public.photos where upload_status = 'complete' and uploaded_at > now() - interval '24 hours'),
    'photos_pending_review', (select count(*) from public.photos where upload_status = 'complete' and moderation_status = 'pending'),
    'photos_flagged', (select count(*) from public.photos where upload_status = 'complete' and flagged),
    'original_bytes', (select coalesce(sum(file_size), 0) from public.photos where upload_status = 'complete'),
    'emails_waiting', (select count(*) from public.guest_emails where sent_at is null and unsubscribed_at is null and attempts < 5),
    'emails_sent', (select count(*) from public.guest_emails where sent_at is not null),
    'emails_failed', (select count(*) from public.guest_emails where sent_at is null and unsubscribed_at is null and attempts >= 5),
    'emails_unsubscribed', (select count(*) from public.guest_emails where unsubscribed_at is not null)
  );
end;
$$;

create function public.admin_events(p_search text, p_status text, p_limit int, p_offset int)
returns table (
  id uuid, code text, title text, status public.event_status, suspended_at timestamptz, created_at timestamptz,
  event_date date, owner_id uuid, owner_email text, guests int, photos int, emails int, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  return query
  select e.id, e.code, e.title, e.status, e.suspended_at, e.created_at, e.event_date, e.owner_id, p.email,
    (select count(*)::int from public.event_guests g where g.event_id = e.id),
    (select count(*)::int from public.photos ph where ph.event_id = e.id and ph.upload_status = 'complete'),
    (select count(*)::int from public.guest_emails ge where ge.event_id = e.id),
    count(*) over ()
  from public.events e
  join public.profiles p on p.id = e.owner_id
  where (coalesce(p_search, '') = '' or e.title ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%' or e.code = p_search)
    and (coalesce(p_status, '') = ''
         or (p_status = 'suspended' and e.suspended_at is not null)
         or e.status::text = p_status)
  order by e.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

create function public.admin_organisers(p_search text, p_limit int, p_offset int)
returns table (
  id uuid, email text, display_name text, is_admin boolean, created_at timestamptz, last_sign_in_at timestamptz,
  confirmed boolean, events int, photos int, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  return query
  select p.id, p.email, p.display_name, p.is_admin, p.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
    (select count(*)::int from public.events e where e.owner_id = p.id),
    (select count(*)::int from public.photos ph join public.events e on e.id = ph.event_id where e.owner_id = p.id and ph.upload_status = 'complete'),
    count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  where coalesce(p_search, '') = '' or p.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%'
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.admin_overview(), public.admin_events(text, text, int, int), public.admin_organisers(text, int, int) from public, anon;
grant execute on function public.admin_overview(), public.admin_events(text, text, int, int), public.admin_organisers(text, int, int) to authenticated;
