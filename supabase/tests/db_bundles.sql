-- Tests for bundle payments and the 1-year storage option. Ends with "ALL TESTS PASSED" and rolls back.
do $$
declare owner uuid := gen_random_uuid(); ev uuid; e public.events; d0 timestamptz; d1 timestamptz; log text := '';
begin
  insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at) values
    (owner, 'o@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now());
  insert into public.events (owner_id, title) values (owner, 'Bundle') returning id into ev;
  select * into e from public.events where id = ev; d0 := public.event_retention_until(e);
  insert into public.payments (event_id, user_id, kind, plan, addons, amount_cents, stripe_session_id)
    values (ev, owner, 'bundle', 'party', array['frame','storage1y','sms'], 9900+1900+1200+1500, 'cs_b1');
  perform public.fulfil_payment('cs_b1', null, null);
  perform public.fulfil_payment('cs_b1', null, null);
  select * into e from public.events where id = ev; d1 := public.event_retention_until(e);
  if e.plan <> 'party' or not e.addon_frame or not e.addon_storage_1y or not e.addon_sms or e.addon_branding or e.addon_storage then raise exception 'FAIL bundle flags'; end if;
  if d1 - d0 <> interval '185 days' then raise exception 'FAIL 1y retention %', d1 - d0; end if;
  log := log || 'bundle ok; 1 year ok; ';
  insert into public.payments (event_id, user_id, kind, addon, amount_cents, stripe_session_id) values (ev, owner, 'addon', 'storage', 700, 'cs_b2');
  perform public.fulfil_payment('cs_b2', null, null);
  select * into e from public.events where id = ev;
  if public.event_retention_until(e) - d0 <> interval '550 days' then raise exception 'FAIL 2y over 1y'; end if;
  log := log || '1y to 2y ok; ';
  begin insert into public.payments (event_id, user_id, kind, amount_cents, stripe_session_id) values (ev, owner, 'bundle', 0, 'x'); raise exception 'FAIL empty bundle';
  exception when check_violation then log := log || 'empty bundle refused'; end;
  raise exception 'ALL TESTS PASSED: %', log;
end $$;
