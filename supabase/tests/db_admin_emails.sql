-- Tests for admins, suspension and guest emails. Run in the SQL editor.
-- Ends with "ALL TESTS PASSED: ..." and rolls everything back.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  ev uuid; g public.event_guests; r record; n int; log text := '';
begin
  insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at) values
    (u1, 'TheggatonKlenner@gmail.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
    (u2, 'someone@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now());
  if not (select is_admin from public.profiles where id = u1) then raise exception 'FAIL admin flag'; end if;
  if (select is_admin from public.profiles where id = u2) then raise exception 'FAIL non-admin flagged'; end if;
  log := log || 'admin flag ok; ';

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role','authenticated')::text, true);
  set local role authenticated;
  begin
    update public.profiles set is_admin = true where id = u2;
    raise exception 'FAIL self admin';
  exception when insufficient_privilege then log := log || 'no self-admin ok; ';
  end;
  if public.is_platform_admin() then raise exception 'FAIL u2 admin'; end if;
  insert into public.events (owner_id, title, photos_per_guest) values (u2, 'Party', 5) returning id into ev;
  begin
    update public.events set suspended_at = now() where id = ev;
    raise exception 'FAIL organiser can suspend';
  exception when insufficient_privilege then log := log || 'suspend guarded ok; ';
  end;
  update public.events set status = 'published' where id = ev;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role','authenticated')::text, true);
  set local role authenticated;
  if not public.is_platform_admin() then raise exception 'FAIL u1 not admin'; end if;
  reset role;

  g := public.guest_join(ev, repeat('c',64), 'Ana', null);
  r := public.add_guest_email(g.id, '  Ana@Example.com ');
  if r.email <> 'ana@example.com' then raise exception 'FAIL normalise'; end if;
  perform public.add_guest_email(g.id, 'ana@example.com');
  if (select count(*) from public.guest_emails where event_id = ev) <> 1 then raise exception 'FAIL dedupe'; end if;
  begin
    perform public.add_guest_email(g.id, 'not-an-email');
    raise exception 'FAIL invalid email';
  exception when check_violation then log := log || 'email validation ok; ';
  end;

  select count(*) into n from public.claim_gallery_emails(ev, 50);
  if n <> 0 then raise exception 'FAIL sent while running'; end if;
  update public.events set status = 'ended' where id = ev;
  select count(*) into n from public.claim_gallery_emails(ev, 50);
  if n <> 1 then raise exception 'FAIL not sent after end (%)', n; end if;
  select count(*) into n from public.claim_gallery_emails(ev, 50);
  if n <> 0 then raise exception 'FAIL double claim'; end if;
  log := log || 'ready rules + no double send ok; ';

  update public.guest_emails set sending_started_at = null where event_id = ev;
  update public.events set gallery_visibility = 'private' where id = ev;
  select count(*) into n from public.claim_gallery_emails(ev, 50);
  if n <> 0 then raise exception 'FAIL private sent'; end if;
  begin
    perform public.add_guest_email(g.id, 'b@example.com');
    raise exception 'FAIL private capture';
  exception when insufficient_privilege then log := log || 'private ok; ';
  end;

  update public.events set gallery_visibility = 'guests', reveal_mode = 'manual', status = 'active' where id = ev;
  select count(*) into n from public.claim_gallery_emails(ev, 50);
  if n <> 0 then raise exception 'FAIL manual unrevealed sent'; end if;
  update public.events set revealed_at = now() where id = ev;
  select count(*) into n from public.claim_gallery_emails(ev, 50);
  if n <> 1 then raise exception 'FAIL manual revealed not sent'; end if;
  log := log || 'manual reveal ok; ';

  update public.events set suspended_at = now() where id = ev;
  begin
    perform public.guest_join(ev, repeat('d',64), null, null);
    raise exception 'FAIL suspended join';
  exception when insufficient_privilege then log := log || 'suspended ok; ';
  end;
  if public.event_accepting_submissions((select e from public.events e where e.id = ev)) then raise exception 'FAIL suspended accepting'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.guest_emails; if n <> 1 then raise exception 'FAIL owner read emails'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.guest_emails; if n <> 0 then raise exception 'FAIL other read emails'; end if;
  reset role;
  set local role anon;
  begin perform * from public.guest_emails; raise exception 'FAIL anon emails';
  exception when insufficient_privilege then log := log || 'email privacy ok; '; end;
  reset role;

  raise exception 'ALL TESTS PASSED: %', log;
end $$;

-- Admin read functions are admin-only.
do $$
declare u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); j jsonb; n int; log text := '';
begin
  insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at) values
    (u1, 'theggatonklenner@gmail.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
    (u2, 'x@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now());
  insert into public.events (owner_id, title) values (u2, 'Party');
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_overview(); raise exception 'FAIL non-admin overview';
  exception when insufficient_privilege then log := log || 'overview guarded; '; end;
  begin perform * from public.admin_events(null, null, 10, 0); raise exception 'FAIL non-admin events';
  exception when insufficient_privilege then log := log || 'events guarded; '; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role','authenticated')::text, true);
  set local role authenticated;
  j := public.admin_overview();
  if (j->>'organisers')::int < 2 then raise exception 'FAIL overview %', j; end if;
  select count(*) into n from public.admin_events('party', null, 10, 0); if n < 1 then raise exception 'FAIL search'; end if;
  reset role;
  raise exception 'ALL TESTS PASSED: %admin reads ok', log;
end $$;
