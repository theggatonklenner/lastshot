-- Regression tests for the audit fixes (migrations 026 and 027). Ends with "ALL TESTS PASSED" and rolls back.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); ev uuid; ref public.discount_codes; n int; pay public.payments; log text := '';
begin
  insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at) values
    (a, 'a@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
    (b, 'b@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now());

  -- 1. A refunded pack can't be fulfilled again, and its unused events are taken back.
  insert into public.payments (user_id, kind, pack, pack_plan, pack_events, amount_cents, stripe_session_id, stripe_payment_intent)
    values (a, 'pack', '5', 'party', 5, 39600, 'cs_audit1', 'pi_audit1');
  perform public.fulfil_payment('cs_audit1', 'pi_audit1', null);
  perform public.record_payment_refund('pi_audit1', 39600, true);
  perform public.fulfil_payment('cs_audit1', 'pi_audit1', null);
  select count(*) into n from public.event_credits where owner_id = a;
  if n <> 1 then raise exception 'FAIL refund refulfil credits=%', n; end if;
  if (select remaining from public.event_credits where owner_id = a) <> 0 then raise exception 'FAIL refund keeps credits'; end if;
  select * into pay from public.payments where stripe_session_id = 'cs_audit1';
  if pay.status <> 'refunded' or pay.refunded_cents <> 39600 then raise exception 'FAIL refund status % %', pay.status, pay.refunded_cents; end if;
  log := log || 'refund ok; ';

  -- 2. Partial refund records the amount but keeps the purchase.
  insert into public.events (owner_id, title) values (b, 'B') returning id into ev;
  insert into public.payments (event_id, user_id, kind, plan, amount_cents, stripe_session_id, stripe_payment_intent)
    values (ev, b, 'bundle', 'party', 9900, 'cs_audit2', 'pi_audit2');
  perform public.fulfil_payment('cs_audit2', 'pi_audit2', null);
  perform public.record_payment_refund('pi_audit2', 2000, false);
  select * into pay from public.payments where stripe_session_id = 'cs_audit2';
  if pay.status <> 'paid' or pay.refunded_cents <> 2000 then raise exception 'FAIL partial refund'; end if;
  log := log || 'partial refund ok; ';

  -- 3. Referral rewards are capped at 10 a year.
  ref := public.ensure_referral_code(a);
  insert into public.discount_codes (code, kind, percent_off, owner_id, max_uses)
    select public.random_code('THANKS'), 'reward', 15, a, 1 from generate_series(1, 10);
  insert into public.payments (event_id, user_id, kind, plan, amount_cents, discount_code_id, stripe_session_id)
    values (ev, b, 'bundle', 'big', 13425, ref.id, 'cs_audit3');
  perform public.fulfil_payment('cs_audit3', null, null);
  select count(*) into n from public.discount_codes where owner_id = a and kind = 'reward';
  if n <> 10 then raise exception 'FAIL reward cap n=%', n; end if;
  log := log || 'reward cap ok; ';

  -- 4. Cover and logo paths must be in the event's own folder.
  begin update public.events set cover_image_path = gen_random_uuid()::text || '/cover/x.jpg' where id = ev; raise exception 'FAIL cover other folder';
  exception when check_violation then null; end;
  begin update public.events set cover_image_path = ev::text || '/cover/../x/y.jpg' where id = ev; raise exception 'FAIL cover dotdot';
  exception when check_violation then null; end;
  update public.events set cover_image_path = ev::text || '/cover/ok.jpg' where id = ev;
  log := log || 'paths ok; ';

  -- 5. Least privilege and the scheduler.
  if has_table_privilege('authenticated', 'public.events', 'TRUNCATE') then raise exception 'FAIL truncate grant'; end if;
  if has_column_privilege('authenticated', 'public.events', 'cover_image_path', 'UPDATE') then raise exception 'FAIL cover grant'; end if;
  if (select prosrc from pg_proc where proname = 'trigger_gallery_email_sender') not like '%guest_push%' then raise exception 'FAIL scheduler'; end if;
  log := log || 'grants and scheduler ok';
  raise exception 'ALL TESTS PASSED: %', log;
end $$;
