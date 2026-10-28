-- Keep the guest access code readable for organisers (events are only readable by their organisers).
-- The hash is still what guests are checked against.
-- Applied to the Lastshot project as migration "readable_access_code".
alter table public.events add column access_code text check (access_code is null or char_length(access_code) between 4 and 32);

create or replace function public.set_event_access_code(p_event_id uuid, p_code text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.events where id = p_event_id and owner_id = (select auth.uid())
  ) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  if p_code is null or btrim(p_code) = '' then
    update public.events set access_code_hash = null, access_code = null where id = p_event_id;
  else
    if char_length(btrim(p_code)) not between 4 and 32 then
      raise exception 'access code must be 4 to 32 characters' using errcode = '22023';
    end if;
    update public.events
       set access_code_hash = extensions.crypt(upper(btrim(p_code)), extensions.gen_salt('bf', 8)),
           access_code = upper(btrim(p_code))
     where id = p_event_id;
  end if;
end;
$$;
revoke execute on function public.set_event_access_code(uuid, text) from public, anon;
grant execute on function public.set_event_access_code(uuid, text) to authenticated;
revoke insert (access_code), update (access_code) on public.events from authenticated;
