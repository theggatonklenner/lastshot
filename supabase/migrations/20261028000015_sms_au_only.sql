-- Text alerts go through an Australian provider: Australian mobiles only.
alter table public.guest_sms add constraint guest_sms_au_mobile check (phone ~ '^\+614[0-9]{8}$');
