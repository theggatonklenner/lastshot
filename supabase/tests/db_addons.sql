-- Tests for add-ons: locked flags, purchase, 2-year retention, SMS sign-ups and claiming.
-- Ends with "ALL TESTS PASSED: ..." and rolls everything back.
do $$
declare
  owner uuid := gen_random_uuid(); ev uuid; g public.event_guests; e public.events; log text := ''; d1 timestamptz; d2 timestamptz;
begin
  insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at) values
    (owner, 'owner@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now());
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.events (owner_id, title, photos_per_guest, frame_text) values (owner, 'Addon test', 5, 'Mia & Jordan') returning id into ev;
  update public.events set status = 'published', frame_color = 'black' where id = ev;
  begin update public.events set addon_frame = true where id = ev; raise exception 'FAIL organiser set addon';
  exception when insufficient_privilege then log := log || 'addon flags locked ok; '; end;
  begin update public.events set keep_photos = true where id = ev; raise exception 'FAIL keep forever';
  exception when insufficient_privilege then log := log || 'keep forever locked ok; '; end;
  reset role;
  g := public.guest_join(ev, repeat('a',64), null, null);
  begin perform public.add_guest_phone(g.id, '+61412345678'); raise exception 'FAIL sms without addon';
  exception when insufficient_privilege then log := log || 'sms needs addon ok; '; end;

  select * into e from public.events where id = ev; d1 := public.event_retention_until(e);
  insert into public.payments (event_id, user_id, kind, addon, amount_cents, stripe_session_id) values
    (ev, owner, 'addon', 'sms', 900, 'cs_a1'), (ev, owner, 'addon', 'storage', 1900, 'cs_a2');
  perform public.fulfil_payment('cs_a1', null, null);
  perform public.fulfil_payment('cs_a2', null, null);
  select * into e from public.events where id = ev; d2 := public.event_retention_until(e);
  if not e.addon_sms or not e.addon_storage or e.addon_frame then raise exception 'FAIL addon flags'; end if;
  if d2 - d1 <> interval '550 days' then raise exception 'FAIL retention %', d2 - d1; end if;
  log := log || 'addons + 2 years ok; ';
  perform public.add_guest_phone(g.id, '+61412345678');
  perform public.add_guest_phone(g.id, '+61412345678');
  if (select count(*) from public.guest_sms where event_id = ev) <> 1 then raise exception 'FAIL dup phone'; end if;
  begin perform public.add_guest_phone(g.id, '0412'); raise exception 'FAIL bad phone';
  exception when check_violation then log := log || 'phone format ok; '; end;
  update public.events set status = 'ended', ended_at = now() where id = ev;
  if (select count(*) from public.claim_gallery_sms(ev, 10)) <> 1 then raise exception 'FAIL claim'; end if;
  if (select count(*) from public.claim_gallery_sms(ev, 10)) <> 0 then raise exception 'FAIL double claim'; end if;
  log := log || 'sms claim once ok';
  raise exception 'ALL TESTS PASSED: %', log;
end;
$$;
