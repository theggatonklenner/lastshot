-- Event Wrapped: a recap of the night, emailed to the organiser the morning after.
-- Applied to the Lastshot project as migration "event_wrapped".
alter table public.events add column wrapped_sent_at timestamptz;

create function public.event_wrapped(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with e as (select * from public.events where id = p_event_id),
  p as (
    select ph.id, ph.guest_id, coalesce(ph.captured_at, ph.uploaded_at, ph.created_at) as at
    from public.photos ph
    where ph.event_id = p_event_id and ph.upload_status = 'complete' and ph.moderation_status = 'approved'
  ),
  buckets as (
    select date_bin('15 minutes', at, '2000-01-01') as start, count(*) as n
    from p group by 1 order by n desc, start limit 1
  ),
  shooters as (
    select g.id, g.display_name, count(*) as n
    from p join public.event_guests g on g.id = p.guest_id
    group by g.id, g.display_name order by n desc limit 1
  ),
  picks as (
    (select id, 1 as k from p order by at asc limit 1)
    union all
    (select p.id, 2 from p, buckets where p.at >= buckets.start and p.at < buckets.start + interval '15 minutes' order by p.at limit 1)
    union all
    (select id, 3 from p order by md5(id::text) limit 2)
    union all
    (select id, 4 from p order by at desc limit 1)
  )
  select jsonb_build_object(
    'photos', (select count(*) from p),
    'shooters', (select count(distinct guest_id) from p),
    'guests', (select count(*) from public.event_guests g where g.event_id = p_event_id),
    'first_at', (select min(at) from p),
    'last_at', (select max(at) from p),
    'busiest_start', (select start from buckets),
    'busiest_count', (select n from buckets),
    'top_name', (select display_name from shooters),
    'top_count', (select n from shooters),
    'show_names', (select show_guest_names from e),
    'pick_ids', coalesce((select jsonb_agg(distinct id) from picks), '[]'::jsonb)
  );
$$;
revoke execute on function public.event_wrapped(uuid) from public, anon, authenticated;
grant execute on function public.event_wrapped(uuid) to service_role;
