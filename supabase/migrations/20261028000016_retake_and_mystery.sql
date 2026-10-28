-- Retake last shot (one per roll) and the mystery shot (+1 shot at a set time).
-- Applied to the Lastshot project as migration "retake_and_mystery".
alter table public.events
  add column mystery_at timestamptz,
  add column mystery_prompt text check (char_length(mystery_prompt) <= 120);
grant insert (mystery_at, mystery_prompt) on public.events to authenticated;
grant update (mystery_at, mystery_prompt) on public.events to authenticated;

alter table public.event_guests add column retakes_used int not null default 0;

create or replace function public.event_shot_limit(e public.events)
returns int language sql stable set search_path = '' as $$
  select e.photos_per_guest
    + case when e.bonus_shots > 0 and e.bonus_at is not null and e.bonus_at <= now() then e.bonus_shots else 0 end
    + case when e.mystery_at is not null and e.mystery_at <= now() then 1 else 0 end;
$$;

-- Deletes the guest's most recent photo (taken in the last 10 minutes) and gives
-- the shot back. One retake per guest. Returns the file paths to delete.
create function public.retake_last_photo(p_guest_id uuid)
returns table (photo_id uuid, storage_path text, display_path text, thumbnail_path text, shots_used int)
language plpgsql security definer set search_path = '' as $$
declare
  g public.event_guests;
  e public.events;
  p public.photos;
begin
  select * into g from public.event_guests where id = p_guest_id for update;
  if not found then raise exception 'guest_not_found' using errcode = 'P0002'; end if;
  if g.blocked then raise exception 'guest_blocked' using errcode = '42501'; end if;
  select * into e from public.events where id = g.event_id;
  if not public.event_accepting_submissions(e) then raise exception 'event_closed' using errcode = '22023'; end if;
  if g.retakes_used >= 1 then raise exception 'no_retakes_left' using errcode = '22023'; end if;

  select * into p from public.photos
   where guest_id = g.id and upload_status = 'complete'
   order by coalesce(uploaded_at, created_at) desc
   limit 1;
  if not found or coalesce(p.uploaded_at, p.created_at) < now() - interval '10 minutes' then
    raise exception 'nothing_to_retake' using errcode = '22023';
  end if;

  delete from public.photos where id = p.id;
  update public.event_guests
     set photos_submitted = greatest(0, photos_submitted - 1), retakes_used = retakes_used + 1, last_active_at = now()
   where id = g.id
  returning * into g;

  return query select p.id, p.storage_path, p.display_path, p.thumbnail_path, g.photos_submitted;
end;
$$;
revoke execute on function public.retake_last_photo(uuid) from public, anon, authenticated;
grant execute on function public.retake_last_photo(uuid) to service_role;
