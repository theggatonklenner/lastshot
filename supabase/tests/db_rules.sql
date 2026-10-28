-- Database rule tests. Run in the Supabase SQL editor (as postgres).
-- The block always ends by raising an exception, which rolls back every change.
-- Expected result: "ALL TESTS PASSED: ..." listing each check.
do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  ev uuid;
  g public.event_guests; g2 public.event_guests;
  r record;
  up1 uuid := gen_random_uuid();
  ok boolean;
  n int;
  log text := '';
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u1, 'org1@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u2, 'org2@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  if (select count(*) from public.profiles where id in (u1,u2)) <> 2 then raise exception 'FAIL profiles trigger'; end if;

  -- Organiser creates and publishes an event
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.events (owner_id, title, photos_per_guest) values (u1, 'Test party', 3) returning id into ev;
  if (select status from public.events where id = ev) <> 'draft' then raise exception 'FAIL insert forced draft'; end if;
  begin
    update public.events set code = 'AAAAAAAAAAAA' where id = ev;
    raise exception 'FAIL code mutable';
  exception when insufficient_privilege then log := log || 'code-immutable ok; ';
  end;
  begin
    update public.events set status = 'ended' where id = ev;
    raise exception 'FAIL bad transition allowed';
  exception when invalid_parameter_value then log := log || 'transition guard ok; ';
  end;
  update public.events set status = 'published' where id = ev;
  perform public.set_event_access_code(ev, 'party26');
  reset role;

  -- Another organiser cannot read or change it
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.events where id = ev;
  if n <> 0 then raise exception 'FAIL cross-owner read'; end if;
  update public.events set title = 'hacked' where id = ev;
  begin
    perform public.set_event_access_code(ev, 'abcd');
    raise exception 'FAIL cross-owner access code';
  exception when insufficient_privilege then log := log || 'cross-owner blocked ok; ';
  end;
  reset role;
  if (select title from public.events where id = ev) <> 'Test party' then raise exception 'FAIL cross-owner update'; end if;

  -- The public anon key can read nothing and call nothing
  set local role anon;
  begin
    perform * from public.photos;
    raise exception 'FAIL anon read photos';
  exception when insufficient_privilege then log := log || 'anon table denied ok; ';
  end;
  begin
    perform public.claim_photo_slot(gen_random_uuid(), gen_random_uuid(), now(), 'camera');
    raise exception 'FAIL anon rpc';
  exception when insufficient_privilege then log := log || 'anon rpc denied ok; ';
  end;
  reset role;

  -- Guest joins with access code; same token resumes the same guest
  begin
    perform public.guest_join(ev, repeat('a',64), 'Sam', 'wrong');
    raise exception 'FAIL bad code accepted';
  exception when invalid_authorization_specification then log := log || 'access code ok; ';
  end;
  g := public.guest_join(ev, repeat('a',64), 'Sam', ' PARTY26 ');
  g2 := public.guest_join(ev, repeat('a',64), null, 'party26');
  if g.id <> g2.id or g2.display_name <> 'Sam' then raise exception 'FAIL guest resume'; end if;

  -- Claim, retry (resume), complete, retry (duplicate)
  select * into r from public.claim_photo_slot(g.id, up1, now(), 'camera');
  if r.result <> 'claimed' or r.shots_used <> 1 then raise exception 'FAIL claim1 %', r; end if;
  if (select status from public.events where id = ev) <> 'active' then raise exception 'FAIL auto active'; end if;
  select * into r from public.claim_photo_slot(g.id, up1, now(), 'camera');
  if r.result <> 'resume' or r.shots_used <> 1 then raise exception 'FAIL resume %', r; end if;
  perform public.complete_photo_upload(r.photo_id, ev||'/o/1.jpg', ev||'/d/1.jpg', ev||'/t/1.jpg', 100, 100, 1000);
  select * into r from public.claim_photo_slot(g.id, up1, now(), 'camera');
  if r.result <> 'duplicate' or r.shots_used <> 1 then raise exception 'FAIL duplicate %', r; end if;
  if (select moderation_status from public.photos where id = r.photo_id) <> 'approved' then raise exception 'FAIL auto approve'; end if;

  -- Storage paths must stay inside the event's folder; failed storage releases the slot
  select * into r from public.claim_photo_slot(g.id, gen_random_uuid(), now(), 'camera');
  begin
    perform public.complete_photo_upload(r.photo_id, gen_random_uuid()||'/o/x.jpg', ev||'/d/x.jpg', ev||'/t/x.jpg', 1,1,1);
    raise exception 'FAIL path scope';
  exception when check_violation then log := log || 'path scope ok; ';
  end;
  perform public.release_photo_slot(r.photo_id);
  if (select photos_submitted from public.event_guests where id = g.id) <> 1 then raise exception 'FAIL release'; end if;

  -- Camera roll uploads are off by default
  begin
    perform public.claim_photo_slot(g.id, gen_random_uuid(), now(), 'library');
    raise exception 'FAIL library';
  exception when insufficient_privilege then log := log || 'library gate ok; ';
  end;

  -- Limit of 3 cannot be exceeded
  perform public.claim_photo_slot(g.id, gen_random_uuid(), now(), 'camera');
  perform public.claim_photo_slot(g.id, gen_random_uuid(), now(), 'camera');
  begin
    perform public.claim_photo_slot(g.id, gen_random_uuid(), now(), 'camera');
    raise exception 'FAIL limit';
  exception when invalid_parameter_value then log := log || 'limit ok; ';
  end;

  -- Abandoned uploads release their slot after 15 minutes
  update public.photos set created_at = now() - interval '20 minutes'
   where id in (select id from public.photos where guest_id = g.id and upload_status='pending' limit 1);
  select * into r from public.claim_photo_slot(g.id, gen_random_uuid(), now(), 'camera');
  if r.result <> 'claimed' or r.shots_used <> 3 then raise exception 'FAIL stale release %', r; end if;

  -- Organiser blocks, moderates; cannot tamper with storage paths; manual reveal
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role','authenticated')::text, true);
  set local role authenticated;
  update public.event_guests set blocked = true where id = g.id;
  begin
    update public.photos set storage_path = 'x' where event_id = ev;
    raise exception 'FAIL path tamper';
  exception when insufficient_privilege then log := log || 'path tamper denied ok; ';
  end;
  update public.photos set moderation_status = 'rejected' where event_id = ev and upload_status='complete';
  update public.events set reveal_mode = 'manual' where id = ev;
  reset role;
  if public.event_gallery_revealed((select e from public.events e where e.id = ev)) then raise exception 'FAIL manual hidden'; end if;
  update public.events set revealed_at = now() where id = ev;
  if not public.event_gallery_revealed((select e from public.events e where e.id = ev)) then raise exception 'FAIL manual reveal'; end if;
  begin
    perform public.claim_photo_slot(g.id, gen_random_uuid(), now(), 'camera');
    raise exception 'FAIL blocked';
  exception when insufficient_privilege then log := log || 'blocked ok; ';
  end;

  -- Ended events refuse new guests
  update public.events set status = 'ended' where id = ev;
  begin
    perform public.guest_join(ev, repeat('b',64), 'New', 'party26');
    raise exception 'FAIL closed join';
  exception when invalid_parameter_value then log := log || 'closed ok; ';
  end;

  -- Rate limiter
  ok := public.check_rate_limit('t', 2, 60); ok := public.check_rate_limit('t', 2, 60); ok := public.check_rate_limit('t', 2, 60);
  if ok then raise exception 'FAIL rate limit'; end if;

  raise exception 'ALL TESTS PASSED: %', log;
end $$;
