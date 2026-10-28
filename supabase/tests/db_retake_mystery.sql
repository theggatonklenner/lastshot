-- Tests for retake last shot and the mystery shot. Ends with "ALL TESTS PASSED" and rolls back.
do $$
declare owner uuid := gen_random_uuid(); ev uuid; g public.event_guests; ph uuid; r record; log text := ''; i int;
begin
  insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at) values
    (owner, 'o@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now());
  insert into public.events (owner_id, title, photos_per_guest, mystery_at, mystery_prompt) values (owner, 'R', 2, now() + interval '1 hour', 'Hat') returning id into ev;
  update public.events set status = 'published' where id = ev;
  g := public.guest_join(ev, repeat('a',64), null, null);
  begin perform public.retake_last_photo(g.id); raise exception 'FAIL retake nothing';
  exception when sqlstate '22023' then log := log || 'nothing to retake ok; '; end;
  for i in 1..2 loop
    select photo_id into ph from public.claim_photo_slot(g.id, gen_random_uuid(), now(), 'camera');
    perform public.complete_photo_upload(ph, ev||'/photos/'||ph||'/original.jpg', ev||'/photos/'||ph||'/display.jpg', ev||'/photos/'||ph||'/thumb.jpg', 10, 10, 10);
  end loop;
  select * into r from public.retake_last_photo(g.id);
  if r.shots_used <> 1 or (select count(*) from public.photos where event_id = ev) <> 1 then raise exception 'FAIL retake result'; end if;
  log := log || 'retake gives shot back ok; ';
  select photo_id into ph from public.claim_photo_slot(g.id, gen_random_uuid(), now(), 'camera');
  perform public.complete_photo_upload(ph, ev||'/photos/'||ph||'/original.jpg', ev||'/photos/'||ph||'/display.jpg', ev||'/photos/'||ph||'/thumb.jpg', 10, 10, 10);
  begin perform public.retake_last_photo(g.id); raise exception 'FAIL second retake';
  exception when sqlstate '22023' then log := log || 'one retake only ok; '; end;
  update public.events set mystery_at = now() - interval '1 minute' where id = ev;
  select * into r from public.claim_photo_slot(g.id, gen_random_uuid(), now(), 'camera');
  if r.shots_limit <> 3 then raise exception 'FAIL mystery limit %', r.shots_limit; end if;
  log := log || 'mystery shot unlocks ok';
  raise exception 'ALL TESTS PASSED: %', log;
end $$;
