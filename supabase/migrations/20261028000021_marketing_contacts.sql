-- Guests who tick "send me news and offers from Lastshot". Separate from the per-event "photos are ready" messages.
-- Applied to the Lastshot project as migration "marketing_contacts".
create table public.marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'sms')),
  contact text not null check (char_length(contact) between 3 and 254),
  event_id uuid references public.events (id) on delete set null,
  consent_text text not null,
  consented_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  unique (channel, contact)
);
alter table public.marketing_contacts enable row level security;
revoke all on public.marketing_contacts from anon, authenticated;
