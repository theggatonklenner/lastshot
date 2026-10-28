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

`supabase/tests/db_rules.sql` exercises the rules (limits, retries, lifecycle, cross-organiser isolation, anon lock-out, path scoping, blocking, closed events, rate limiting). Paste it into the SQL editor; it ends with `ALL TESTS PASSED` and rolls itself back.

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
