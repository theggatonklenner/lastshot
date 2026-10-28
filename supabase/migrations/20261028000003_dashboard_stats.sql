-- Read-only stats for the organiser dashboard. SECURITY INVOKER, so RLS limits
-- results to events the caller owns.

create function public.event_stats(p_event_ids uuid[])
returns table (
  event_id uuid,
  guests int,
  photos int,
  pending_review int,
  rejected int,
  flagged int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id,
    (select count(*)::int from public.event_guests g where g.event_id = e.id),
    (select count(*)::int from public.photos p where p.event_id = e.id and p.upload_status = 'complete'),
    (select count(*)::int from public.photos p where p.event_id = e.id and p.upload_status = 'complete' and p.moderation_status = 'pending'),
    (select count(*)::int from public.photos p where p.event_id = e.id and p.upload_status = 'complete' and p.moderation_status = 'rejected'),
    (select count(*)::int from public.photos p where p.event_id = e.id and p.upload_status = 'complete' and p.flagged)
  from public.events e
  where e.id = any (p_event_ids);
$$;

create function public.event_upload_timeline(p_event_id uuid, p_bucket_minutes int default 60)
returns table (bucket timestamptz, photos int, camera int, library int)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    to_timestamp(floor(extract(epoch from p.uploaded_at) / (p_bucket_minutes * 60)) * (p_bucket_minutes * 60)) as bucket,
    count(*)::int,
    count(*) filter (where p.source = 'camera')::int,
    count(*) filter (where p.source = 'library')::int
  from public.photos p
  where p.event_id = p_event_id and p.upload_status = 'complete'
  group by 1
  order by 1;
$$;

revoke execute on function public.event_stats(uuid[]), public.event_upload_timeline(uuid, int) from public, anon;
grant execute on function public.event_stats(uuid[]), public.event_upload_timeline(uuid, int) to authenticated;
