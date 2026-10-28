-- Tests for plans (guest limits), payments and bonus shots.
-- Ends with "ALL TESTS PASSED: ..." and rolls everything back.
do $$
declare
  owner uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  ev uuid; g public.event_guests; g1 public.event_guests; n int; ph uuid; pay public.payments; log text := '';
  i int; r record;
begin
  insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at) values
    (owner, 'owner@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
    (other, 'other@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now());

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.events (owner_id, title, photos_per_guest, bonus_shots, bonus_at)
    values (owner, 'Plan test', 2, 3, now() + interval '1 hour') returning id into ev;
  update public.events set status = 'published' where id = ev;
  -- Organisers can't change their own plan.
  begin update public.events set plan = 'unlimited' where id = ev; raise exception 'FAIL organiser set plan';
  exception when insufficient_privilege then log := log || 'plan locked ok; '; end;
  -- But can change bonus shots.
  update public.events set bonus_shots = 3 where id = ev;
  -- Can't create payments.
  begin insert into public.payments (event_id, user_id, plan, amount_cents, stripe_session_id) values (ev, owner, 'big', 0, 'x');
    raise exception 'FAIL organiser insert payment';
  exception when insufficient_privilege then log := log || 'payments locked ok; '; end;
  reset role;

  if (select plan from public.events where id = ev) <> 'free' then raise exception 'FAIL default plan'; end if;

  -- Free plan: 10 guests, the 11th is refused, returning guests still get in.
  for i in 1..10 loop
    g := public.guest_join(ev, lpad(to_hex(i), 64, '0'), null, null);
  end loop;
  begin perform public.guest_join(ev, repeat('f',64), null, null); raise exception 'FAIL 11th guest joined';
  exception when sqlstate '53400' then log := log || 'guest limit ok; '; end;
  g1 := public.guest_join(ev, lpad(to_hex(1), 64, '0'), 'Back', null);
  log := log || 'returning guest ok; ';

  -- Bonus shots: locked until bonus_at.
  for i in 1..2 loop
    select photo_id into ph from public.claim_photo_slot(g1.id, gen_random_uuid(), now(), 'camera');
  end loop;
  begin perform public.claim_photo_slot(g1.id, gen_random_uuid(), now(), 'camera'); raise exception 'FAIL bonus too early';
  exception when sqlstate '22023' then log := log || 'bonus locked ok; '; end;
  update public.events set bonus_at = now() - interval '1 minute' where id = ev;
  select * into r from public.claim_photo_slot(g1.id, gen_random_uuid(), now(), 'camera');
  if r.shots_limit <> 5 or r.shots_used <> 3 then raise exception 'FAIL bonus unlocked (%/%)', r.shots_used, r.shots_limit; end if;
  log := log || 'bonus unlocked ok; ';

  -- Payment fulfilment upgrades once, never downgrades.
  insert into public.payments (event_id, user_id, plan, amount_cents, stripe_session_id)
    values (ev, owner, 'small', 5900, 'cs_test_1');
  pay := public.fulfil_payment('cs_test_1', 'pi_1', 'owner@test.local');
  pay := public.fulfil_payment('cs_test_1', 'pi_1', 'owner@test.local');
  if pay.status <> 'paid' or (select plan from public.events where id = ev) <> 'small' then raise exception 'FAIL fulfil'; end if;
  g := public.guest_join(ev, repeat('f',64), null, null);
  log := log || 'upgrade lets guests in ok; ';
  update public.events set plan = 'big' where id = ev;
  insert into public.payments (event_id, user_id, plan, amount_cents, stripe_session_id) values (ev, owner, 'party', 4900, 'cs_test_2');
  perform public.fulfil_payment('cs_test_2', null, null);
  if (select plan from public.events where id = ev) <> 'big' then raise exception 'FAIL downgraded'; end if;
  log := log || 'no downgrade ok; ';

  -- Payments are visible to the organiser, not to others.
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.payments where event_id = ev; if n <> 2 then raise exception 'FAIL owner payments %', n; end if;
  begin perform public.fulfil_payment('cs_test_1', null, null); raise exception 'FAIL organiser fulfil';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.payments where event_id = ev; if n <> 0 then raise exception 'FAIL other payments'; end if;
  reset role;
  log := log || 'payment privacy ok';

  raise exception 'ALL TESTS PASSED: %', log;
end;
$$;
