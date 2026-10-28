# Lastshot

A disposable camera for events. Organisers create an event and share a QR code. Guests scan it, get a limited roll of shots on their own phone (no app, no account), and every photo lands in one shared gallery that opens live, at a set time, or when the organiser decides.

## Stack

- Next.js 16 (App Router, TypeScript), Tailwind CSS 4
- Supabase: Postgres with Row Level Security, Auth (organisers), private Storage, Realtime
- `sharp` for server-side validation, metadata stripping and resizing
- `qrcode`, `pdf-lib` (printable sign), `client-zip` (ZIP downloads in the browser)

Supabase project: **Lastshot** (`djufzzzbrekklhtmhpmb`, Sydney region).

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in SUPABASE_SECRET_KEY
npm run dev
```

| Variable | Where it's used | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Publishable key. Safe to expose; RLS protects data |
| `SUPABASE_SECRET_KEY` | server only | Supabase dashboard > Project Settings > API Keys > Secret keys. Never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | QR codes, auth emails | Your deployed URL, no trailing slash |
| `RESEND_API_KEY` | server only | Resend API key, for "photos are ready" emails |
| `EMAIL_FROM` | server only | Sender, e.g. `Lastshot <photos@yourdomain.com>`. The domain must be verified in Resend |
| `EMAIL_REPLY_TO` | server only | Optional reply-to address |
| `CRON_SECRET` | server only | Optional. Locks the email scheduler endpoint (see below) |
| `STRIPE_SECRET_KEY` | server only | Stripe secret key. `sk_test_...` for testing, `sk_live_...` for real payments |
| `STRIPE_WEBHOOK_SECRET` | server only | Signing secret of the Stripe webhook for `/api/stripe/webhook` |

Camera access needs HTTPS on phones. To test on a phone locally, use a tunnel (for example `npx localtunnel --port 3000`) or deploy a preview.

## Deploy (Vercel)

1. Import the GitHub repo into Vercel. Framework preset: Next.js.
2. Add the four environment variables above (Production and Preview).
3. Deploy.
4. In Supabase > Authentication > URL Configuration, set **Site URL** to your Vercel URL and add `https://<your-domain>/auth/callback` to **Redirect URLs**.
5. Supabase's built-in email sender is rate limited and meant for testing. For real use, add custom SMTP under Authentication > Emails.

## Database

Migrations live in `supabase/migrations` and have already been applied to the Lastshot project:

1. `core_schema`: profiles, events, event_guests, photos, event_settings, rate_limits
2. `functions_and_security`: lifecycle guard, atomic guest functions, RLS, column grants, storage bucket
3. `dashboard_stats`: read-only stats for the organiser dashboard
4. `admin_and_guest_emails`: site admins, suspension, guest email capture and claiming
5. `admin_views`: admin-only read functions
6. `email_scheduler`: pg_cron job that triggers the email sender
7. `reports_retention_team_errors`: co-organisers, photo reports, auto-clean, error log
8. `plans_payments_bonus`: plans and guest limits, Stripe payments, bonus shots
9. `plans_small_tier`: the 50-guest Small plan, Free down to 10 guests
10. `extra_seats`: extra seats bought on top of a plan

`supabase/tests/db_rules.sql`, `db_admin_emails.sql` and `db_team_reports_retention.sql` exercise the rules (limits, retries, lifecycle, cross-organiser isolation, anon lock-out, path scoping, blocking, closed events, rate limiting). Paste it into the SQL editor; it ends with `ALL TESTS PASSED` and rolls itself back.

Unit tests for the reveal and access rules: `npm test`.

## How the important parts work

### Guest identity

Each phone gets a random 256-bit token on joining. It is stored in an httpOnly cookie and in localStorage (sent as a header if the cookie is cleared, which Safari sometimes does). The database only stores its SHA-256 hash.

### Photo limits

Limits are enforced in Postgres, not the browser. `claim_photo_slot()` locks the guest row (`SELECT ... FOR UPDATE`), so concurrent uploads from one guest are serialised and can't exceed the limit. Each shot has a client-generated `clientUploadId` with a unique constraint, so a retried upload resumes or returns the existing photo instead of becoming a second one.

Upload order: validate image, claim a shot, write three sizes to storage, mark complete, then report success. If storage fails the shot is released. Abandoned uploads (pending over 15 minutes) release automatically. Deleting a photo does not refund the shot.

On the phone, every shot is saved to IndexedDB before upload, uploaded oldest-first with progress, retried automatically (2s, 6s, 15s, then on reconnect or tap), and removed only after the server confirms.

### Limits of anonymous identity

An anonymous guest can get a fresh roll by clearing site data or switching browser. Mitigations in place:

- New camera identities are rate limited per network (40 per event per hour, 120 overall per hour).
- Organisers can see every camera and block misuse.
- An optional access code stops people who only have a forwarded link.

For events that need strict one-roll-per-person, the remaining options are invite-only links (one token per guest, sent individually) or requiring guests to verify an email or phone. The schema has `event_guests.user_id` ready for a signed-in guest mode.

### Gallery privacy

- Storage bucket `event-media` is private with no storage policies. Only the server (secret key) can read or write.
- Guests never query the database. Every guest request goes through a server route that verifies the token and checks `galleryAccess()` (visibility + live/scheduled/manual reveal) before listing or signing anything. Hidden photos are never returned or signed, so direct API calls and guessed URLs get nothing.
- Signed URLs expire after 1 hour (30 minutes for ZIP downloads).
- The anon key has no table access at all. Organisers reach only their own rows through RLS, and column grants stop them altering storage paths, codes or ownership.
- Storage paths are constrained in the database to the event's own folder, so a path can't be pointed at another event's files.
- Uploads are decoded and re-encoded with `sharp`, which strips EXIF and GPS data and rejects anything that isn't a real JPEG, PNG or WebP of sane dimensions.

### Event lifecycle

`draft → published → active → ended → archived`, enforced by a trigger. An event becomes `active` when the first photo arrives. Unpublishing is only possible before anyone joins. Settings changes never touch existing photos: lowering the shot limit just leaves some guests with zero shots left.

### "Photos are ready" emails

Guests can leave an email when they join or on the finished-roll screen. An event is ready to email when its gallery is open to guests and no more photos are coming:

- live galleries: when the organiser ends the event
- scheduled reveal: at the reveal time
- manual reveal: when the organiser reveals it

Private galleries and suspended events never send. Each address gets one email with a private link (`/e/<code>/g/<token>`) that opens the gallery with downloads on any device. Only a hash of the link is stored. Links are derived from `LINK_SECRET` (or the Supabase secret key), so a retried send reuses the same link.

Sending happens straight after an organiser ends or reveals, and every 5 minutes through Supabase `pg_cron` (job `lastshot-gallery-emails`), which calls `/api/cron/gallery-emails`. Postgres hands each email to exactly one sender (`claim_gallery_emails`, `FOR UPDATE SKIP LOCKED`), retries up to 5 times, and Resend's idempotency key stops duplicates. Every email has an unsubscribe link.

To point the scheduler at your app, add a Vault secret named `lastshot_cron_url` with the value `https://<your-domain>/api/cron/gallery-emails` (Supabase > Project Settings > Vault). If you set `CRON_SECRET` in Vercel, add the same value as `lastshot_cron_secret`.

## Site admin

`/admin` is for site admins only (checked in the database on every request; others get a 404). Admins are flagged in `profiles.is_admin`; addresses in `app_admins` become admins on sign-up (currently theggatonklenner@gmail.com). It covers:

- Overview: organisers, events by status, photos, storage estimate, review queue, email health
- Events: search, filter, suspend with a reason, delete, inspect and delete photos
- Organisers: search, grant or remove admin, delete an organiser with all their events
- Emails: setup checks, failures with errors, run the sender, retry failed

Suspension stops guests joining, shooting and viewing, and can only be lifted by an admin.

### Co-organisers

The creator of an event can invite co-organisers by email (Settings tab, Team). Invites last 14 days and only work for an account with the invited address. Co-organisers can do everything except delete the event or change the team. Access is enforced in Postgres: every organiser policy uses `is_event_organiser(event_id)`.

### Photo reports

Anyone who can see a gallery can report a photo. The photo is flagged and the creator is emailed (at most every 15 minutes per event). Three separate reports hide the photo until it's reviewed. Approving a photo or clearing its flag closes its reports.

### Auto-clean

Photos are deleted 180 days after an event ends (drafts that were never published: 180 days after creation), unless the organiser turns on "Keep photos after 180 days". The creator is emailed two weeks before. A daily `pg_cron` job (`lastshot-cleanup`) calls `/api/cron/cleanup` (Vault secret `lastshot_cleanup_url`).

### Plans and payments

Each event has a plan: Free (10 guests), Small ($49, 50), Party ($99, 100), Big event ($179, 300) or Unlimited ($299). Prices are in `src/lib/plans.ts`; guest limits are also in `public.plan_guest_limit()` and must match (a unit test checks the TypeScript side). Postgres refuses new guests once the limit is reached (`guest_join`, with the event row locked so two guests can't take the last place); guests who already joined always get back in. The creator gets one "event is full" email.

Upgrading uses Stripe Checkout (`/dashboard/events/<id>/upgrade`). Organisers pay only the difference between plans. The plan changes when Stripe's webhook (`/api/stripe/webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`) or the success page confirms the payment with Stripe; `fulfil_payment()` is idempotent and never downgrades. Organisers can't change `events.plan` themselves (column grants). Admins can set a plan from the admin event page.

### Extra seats

On any plan except Unlimited, organisers can add 5 to 500 extra seats with a slider on the upgrade page. The more they add, the less each seat costs: $3 (5–45), $2.50 (50–145), $2 (150+); see `SEAT_TIERS` in `src/lib/plans.ts`. The server recalculates the price, so the slider can't be tampered with. Paid seats are added to `events.extra_guests` by `fulfil_payment()`, and `event_guest_limit()` (plan limit plus extra seats) is what `guest_join` checks. If a bigger plan would cost less than the seats chosen, the page suggests it.

### Bonus shots

Organisers can add extra shots that unlock at a set time. `event_shot_limit()` adds them once `bonus_at` has passed, and `claim_photo_slot()` uses it, so the limit is still enforced in Postgres.

### TV slideshow

`/show/<event id>` (organisers only) plays approved photos full screen, puts new ones first, refreshes every 12 seconds and shows the join QR code.

### Error alerts

Server errors (`src/instrumentation.ts`) and browser errors (`/api/client-error`) are logged in `app_errors`, grouped by fingerprint, and shown at `/admin/errors`. Site admins (and `ALERT_EMAIL`, if set) are emailed the first time an error appears and again if it recurs after a quiet hour.

## Data retention and backups

- Photos and guest records are kept until the organiser deletes them or the event.
- Deleting an event removes its database rows first (so nothing can be signed) and then every stored file.
- Rate-limit counters are cleared after a day.
- Database backups follow your Supabase plan (paid plans keep daily backups for a set number of days; check Supabase's backup docs for the current terms). Deleted rows age out of backups on that schedule. Storage objects are not included in database backups, so deleted photo files are gone immediately.

## Project layout

```
src/app/                 routes (landing, auth, dashboard, guest /e/[code], /try demo, API)
src/components/camera/   the guest camera
src/lib/client/          image pipeline, upload queue, ZIP downloads
src/lib/server/          guest auth, media, gallery access, organiser helpers
src/lib/rules.ts         reveal and access rules shared by pages and routes
supabase/                migrations and SQL tests
```
