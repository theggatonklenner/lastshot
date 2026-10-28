-- Tests for referral codes, packs, second-event codes and short links. Ends with "ALL TESTS PASSED" and rolls back.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); ev uuid; ev2 uuid; pid uuid;
  ref public.discount_codes; cr public.event_credits; e public.events; n int; log text := '';
begin
  insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at) values
    (a, 'a@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
    (b, 'b@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now());

  -- Referral: A's code used by B gives A a reward code.
  ref := public.ensure_referral_code(a);
  if ref.code !~ '^FRIEND-' or (public.ensure_referral_code(a)).id <> ref.id then raise exception 'FAIL referral code'; end if;
  insert into public.events (owner_id, title) values (b, 'B party') returning id into ev;
  insert into public.payments (event_id, user_id, kind, plan, amount_cents, subtotal_cents, discount_cents, discount_code_id, stripe_session_id)
    values (ev, b, 'bundle', 'small', 4165, 4900, 735, ref.id, 'cs_g1');
  perform public.fulfil_payment('cs_g1', null, null);
  perform public.fulfil_payment('cs_g1', null, null);
  select count(*) into n from public.discount_codes where owner_id = a and kind = 'reward';
  if n <> 1 then raise exception 'FAIL reward count %', n; end if;
  if (select uses from public.discount_codes where id = ref.id) <> 1 then raise exception 'FAIL uses'; end if;
  log := log || 'referral reward ok; ';

  -- Pack: credits added, redeemed once per event, not twice.
  insert into public.payments (user_id, kind, pack, pack_plan, pack_events, pack_branding, amount_cents, stripe_session_id)
    values (a, 'pack', '5', 'big', 5, true, 83200, 'cs_g2');
  perform public.fulfil_payment('cs_g2', null, null);
  select * into cr from public.event_credits where owner_id = a;
  if cr.remaining <> 5 or not cr.branding then raise exception 'FAIL pack credits'; end if;
  insert into public.events (owner_id, title) values (a, 'A event') returning id into ev2;
  e := public.redeem_event_credit(cr.id, ev2, a);
  if e.plan <> 'big' or not e.addon_branding then raise exception 'FAIL redeem'; end if;
  begin perform public.redeem_event_credit(cr.id, ev2, a); raise exception 'FAIL double redeem';
  exception when invalid_parameter_value then null; end;
  begin perform public.redeem_event_credit(cr.id, ev, b); raise exception 'FAIL other user redeem';
  exception when no_data_found then null; end;
  if (select remaining from public.event_credits where id = cr.id) <> 4 then raise exception 'FAIL remaining'; end if;
  log := log || 'packs ok; ';

  -- Second-event code only once the event has ended with photos.
  if (public.create_second_event_code(ev2)).id is not null then raise exception 'FAIL code before end'; end if;
  update public.events set status = 'published' where id = ev2;
  update public.events set status = 'ended' where id = ev2;
  if (public.create_second_event_code(ev2)).id is not null then raise exception 'FAIL code without photos'; end if;
  log := log || 'next-event rules ok; ';

  -- Partners get a code, and slugs can't clash with event links.
  insert into public.partners (slug, name) values ('grand-hall', 'The Grand Hall') returning id into pid;
  if not exists (select 1 from public.discount_codes where partner_id = pid and code = 'GRANDHALL' and percent_off = 15) then raise exception 'FAIL partner code'; end if;
  begin update public.events set custom_slug = 'grand-hall' where id = ev2; raise exception 'FAIL slug clash';
  exception when unique_violation then null; end;
  update public.partners set discount_percent = 20 where id = pid;
  if (select percent_off from public.discount_codes where partner_id = pid) <> 20 then raise exception 'FAIL partner sync'; end if;
  log := log || 'partners ok';
  raise exception 'ALL TESTS PASSED: %', log;
end $$;
