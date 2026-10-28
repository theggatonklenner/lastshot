-- Venue pages and custom event links share lastshot.app/<slug>. Keep them unique across both.
-- Applied to the Lastshot project as migration "short_links_namespace".
create function public.check_short_slug()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'partners' then
    if exists (select 1 from public.events where custom_slug = new.slug) then
      raise exception 'slug_taken' using errcode = '23505';
    end if;
  elsif new.custom_slug is not null then
    if exists (select 1 from public.partners where slug = new.custom_slug) then
      raise exception 'slug_taken' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;
create trigger partners_slug_unique before insert or update of slug on public.partners
  for each row execute function public.check_short_slug();
create trigger events_slug_unique before insert or update of custom_slug on public.events
  for each row execute function public.check_short_slug();

-- Each venue gets a code (its slug in capitals) that customers can type at checkout.
create function public.partner_code()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  c text := left(upper(regexp_replace(new.slug, '[^a-z0-9]', '', 'g')), 24);
begin
  if char_length(c) < 4 then
    c := public.random_code('VENUE');
  end if;
  if exists (select 1 from public.discount_codes where code = c) then
    c := public.random_code(left(c, 17));
  end if;
  insert into public.discount_codes (code, kind, percent_off, partner_id)
  values (c, 'partner', greatest(new.discount_percent, 1), new.id)
  on conflict do nothing;
  return new;
end;
$$;
create trigger partners_code after insert on public.partners
  for each row execute function public.partner_code();

create function public.partner_code_sync()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.discount_codes
     set percent_off = greatest(new.discount_percent, 1), active = new.active and new.discount_percent > 0
   where partner_id = new.id and kind = 'partner';
  return new;
end;
$$;
create trigger partners_code_sync after update of discount_percent, active on public.partners
  for each row execute function public.partner_code_sync();

revoke execute on function public.check_short_slug(), public.partner_code(), public.partner_code_sync() from public, anon, authenticated;
revoke update (custom_slug, addon_link) on public.events from authenticated;
