-- Tests for co-organisers, photo reports, retention and the error log.
-- Ends with "ALL TESTS PASSED: ..." and rolls everything back.
do $$
declare
  owner uuid := gen_random_uuid(); co uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  ev uuid; g public.event_guests; r record; n int; ok boolean; ph uuid; log text := '';
  eid uuid;
begin
  insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at) values
    (owner, 'owner@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
    (co, 'co@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
    (stranger, 'x@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now());

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.events (owner_id, title, photos_per_guest) values (owner, 'Team test', 5) returning id into ev;
  update public.events set status = 'published' where id = ev;
  reset role;

  insert into public.event_invites (event_id, email, token_hash, invited_by) values (ev, 'co@test.local', repeat('e',64), owner);
  begin perform public.accept_event_invite(repeat('e',64), stranger); raise exception 'FAIL wrong account accepted';
  exception when insufficient_privilege then log := log || 'invite email check ok; '; end;
  eid := public.accept_event_invite(repeat('e',64), co);
  if eid <> ev then raise exception 'FAIL accept'; end if;

  g := public.guest_join(ev, repeat('a',64), 'Ana', null);
  select photo_id into ph from public.claim_photo_slot(g.id, gen_random_uuid(), now(), 'camera');
  perform public.complete_photo_upload(ph, ev||'/p/1.jpg', ev||'/p/2.jpg', ev||'/p/3.jpg', 10, 10, 10);

  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.events where id = ev; if n <> 1 then raise exception 'FAIL co read event'; end if;
  select count(*) into n from public.photos where event_id = ev; if n <> 1 then raise exception 'FAIL co read photos'; end if;
  update public.photos set moderation_status = 'approved' where id = ph;
  update public.events set title = 'Team test 2' where id = ev;
  perform public.set_event_access_code(ev, 'abcd');
  delete from public.events where id = ev;
  reset role;
  if (select count(*) from public.events where id = ev) <> 1 then raise exception 'FAIL co deleted event'; end if;
  if (select title from public.events where id = ev) <> 'Team test 2' then raise exception 'FAIL co update'; end if;
  log := log || 'co-organiser rights ok; ';

  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.events where id = ev; if n <> 0 then raise exception 'FAIL stranger event'; end if;
  select count(*) into n from public.photos where event_id = ev; if n <> 0 then raise exception 'FAIL stranger photos'; end if;
  select count(*) into n from public.event_members where event_id = ev; if n <> 0 then raise exception 'FAIL stranger members'; end if;
  begin perform public.set_event_access_code(ev, 'zzzz'); raise exception 'FAIL stranger code';
  exception when insufficient_privilege then null; end;
  reset role;
  log := log || 'stranger blocked ok; ';

  perform set_config('request.jwt.claims', json_build_object('sub', co, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform token_hash from public.event_invites; raise exception 'FAIL token readable';
  exception when insufficient_privilege then log := log || 'invite tokens hidden ok; '; end;
  delete from public.event_members where event_id = ev and user_id = co;
  select count(*) into n from public.events where id = ev; if n <> 0 then raise exception 'FAIL left but still sees'; end if;
  reset role;
  log := log || 'leave ok; ';

  select * into r from public.report_photo(ph, ev, repeat('1',64), 'privacy', null);
  if not r.first_report or r.hidden then raise exception 'FAIL first report %', r; end if;
  select * into r from public.report_photo(ph, ev, repeat('1',64), 'privacy', null);
  if r.report_count <> 1 then raise exception 'FAIL duplicate report counted'; end if;
  perform public.report_photo(ph, ev, repeat('2',64), 'inappropriate', null);
  select * into r from public.report_photo(ph, ev, repeat('3',64), 'other', 'hmm');
  if not r.hidden or (select moderation_status from public.photos where id = ph) <> 'pending' then raise exception 'FAIL auto-hide'; end if;
  begin perform public.report_photo(ph, ev, repeat('4',64), 'other', null); raise exception 'FAIL report hidden photo';
  exception when no_data_found then log := log || 'reports ok; '; end;

  update public.events set status = 'ended' where id = ev;
  update public.events set ended_at = now() - interval '200 days' where id = ev;
  select count(*) into n from public.events_due_for_cleanup(10) where id = ev; if n <> 1 then raise exception 'FAIL due cleanup'; end if;
  update public.events set keep_photos = true where id = ev;
  select count(*) into n from public.events_due_for_cleanup(10) where id = ev; if n <> 0 then raise exception 'FAIL keep ignored'; end if;
  update public.events set keep_photos = false, ended_at = now() - interval '170 days' where id = ev;
  select count(*) into n from public.events_due_for_retention_warning(10) where id = ev; if n <> 1 then raise exception 'FAIL warning'; end if;
  log := log || 'retention ok; ';

  ok := public.log_app_error(repeat('f',64), 'server', 'boom', '/x', null, null);
  if not ok then raise exception 'FAIL first alert'; end if;
  ok := public.log_app_error(repeat('f',64), 'server', 'boom', '/x', null, null);
  if ok then raise exception 'FAIL alert not throttled'; end if;
  if (select count from public.app_errors where fingerprint = repeat('f',64)) <> 2 then raise exception 'FAIL count'; end if;
  log := log || 'error log ok; ';

  raise exception 'ALL TESTS PASSED: %', log;
end $$;
