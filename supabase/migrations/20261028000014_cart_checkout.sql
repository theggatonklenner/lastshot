-- One checkout for everything: plan + extra seats + add-ons, optionally publishing the event once paid.
-- Applied to the Lastshot project as migration "cart_checkout"; fulfil_payment body as applied there
-- (adds seats for any payment with extra_guests > 0, and publishes drafts when publish_on_paid).
alter table public.payments add column publish_on_paid boolean not null default false;
alter table public.payments drop constraint payments_kind_shape;
alter table public.payments add constraint payments_kind_shape check (
  (kind = 'plan' and plan is not null and extra_guests = 0 and addon is null)
  or (kind = 'seats' and plan is null and extra_guests > 0 and addon is null)
  or (kind = 'addon' and plan is null and extra_guests = 0 and addon is not null)
  or (kind = 'bundle' and addon is null and (plan is not null or cardinality(addons) > 0 or extra_guests > 0))
);
