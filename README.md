# TSV BoxGym

## Configuration

Copy `.env.example` into your local environment and fill in the required values.

```bash
cp .env.example .env.local
```

For local development, these keys are mandatory before login and API routes can work:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TRAINER_SESSION_SECRET`

If any of the public Supabase keys are missing, local API requests can fail with a rendered HTML 500 page instead of JSON.

Important variables for production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL=https://tsvboxgym.de`
- `NEXT_PUBLIC_APP_BASE_URL=https://tsvboxgym.de`
- `APP_BASE_URL=https://tsvboxgym.de`
- `TRAINER_SESSION_SECRET`
- `PUBLIC_AREA_SESSION_SECRET`
- `MEMBER_DEVICE_SESSION_SECRET` — recommended; falls back to `TRAINER_SESSION_SECRET` if not set
- `QR_ACCESS_SESSION_SECRET` — recommended; falls back through `MEMBER_DEVICE_SESSION_SECRET` → `TRAINER_SESSION_SECRET`
- `GS_MEMBERSHIP_CONFIRMATION_SECRET` — recommended; falls back through `PUBLIC_AREA_SESSION_SECRET` → `TRAINER_SESSION_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL=TSV BoxGym <noreply@tsvboxgym.de>`
- `RESEND_REPLY_TO_EMAIL=info@tsvboxgym.de`
- `ADMIN_NOTIFICATION_EMAIL=info@tsvboxgym.de`
- `CRON_SECRET`
- `QR_ACCESS_TOKEN`
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for distributed rate limiting

Optional / legacy only:

- `ADMIN_LOGIN_PASSWORD` is legacy and no longer used for login (standalone `/api/admin-auth` is deprecated)
- `NEXT_PUBLIC_RESEND_API_KEY` only as local-development fallback

## Mail Domain

Verification and registration mails are configured for `tsvboxgym.de`.

Before production mail can work reliably, make sure of the following:

- Add `tsvboxgym.de` as a sending domain in Resend.
- Set the DNS records required by Resend for domain verification and DKIM/SPF.
- Use a verified sender address such as `noreply@tsvboxgym.de`.
- Prefer `RESEND_API_KEY` on the server and avoid relying on `NEXT_PUBLIC_RESEND_API_KEY` in production.
- Keep `NEXT_PUBLIC_APP_URL` and `APP_BASE_URL` aligned with the real public domain so verification links point to the correct site.

## Admin Sammelmail

Admin notifications for new registrations are now queued and sent as a single digest mail on weekdays at `09:00` in `Europe/Berlin`.

To enable this in production:

- run the SQL in `supabase/admin_notification_queue.sql`
- set `ADMIN_NOTIFICATION_EMAIL`
- set `CRON_SECRET`
- deploy `vercel.json` so Vercel calls `/api/admin-digest`

The cron is scheduled for `07:00` and `08:00` UTC on weekdays, and the route itself only sends when local Berlin time is exactly `09:00`. This keeps the digest stable across winter and summer time.

## Mail-Ausgang

Wettkämpfer-Benachrichtigungen werden nicht mehr sofort verschickt. Sie landen zuerst im Mail-Ausgang und werden ebenfalls werktags um `09:00` über denselben Cron versendet.

To enable this in production:

- run the SQL in `supabase/outgoing_mail_queue.sql`
- keep `CRON_SECRET` set

## Trainer Accounts

Trainer logins now use their own registration flow with:

- registration via E-Mail and PIN
- E-Mail verification
- admin approval before access is granted

The trainer session itself is signed with `TRAINER_SESSION_SECRET`. Do not reuse unrelated passwords as a session secret.

Before this can work in Supabase, run the SQL in `supabase/trainer_accounts.sql` to create the `trainer_accounts` table and its indexes.

## Competition Data

The admin competition page uses additional member fields for:

- `is_competition_member`
- `competition_license_number`
- `last_medical_exam_date`
- `competition_fights`
- `competition_wins`
- `competition_losses`
- `competition_draws`

Before the page can persist these values in Supabase, run the SQL in `supabase/member_competition_fields.sql`.

## Boxzwerge

For `Boxzwerge`, the app now supports a special flow:

- child lookup via first name, last name and birthdate instead of PIN
- parent email and parent phone as required registration data
- additional parent / emergency contact name

Before this can be stored in Supabase, run the SQL in `supabase/member_boxzwerge_fields.sql`.

## GS-Abgleich

The admin office reconciliation stores separate status fields on `members` for the current office lists:

- `office_list_status`
- `office_list_group`
- `office_list_checked_at`

It also stores each GS-Sammelabgleich as its own run in `office_reconciliation_runs`, including timestamp, active flag and the saved result snapshot.

Before the GS reconciliation can persist data in Supabase, run the SQL in `supabase/member_office_list_fields.sql`.

If you use `supabase/production_remaining.sql` for manual rollout, the GS fields are included there as well.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Useful checks before deployment:

```bash
npm run lint
npm run typecheck
npm run build
```

## E2E Smoke Tests

The repository now includes a Playwright smoke test suite for public pages and APIs, plus optional authenticated live or staging checks.

Install dependencies and browser once:

```bash
npm install
npx playwright install chromium
```

Public smoke tests against the configured base URL:

```bash
npm run test:e2e
```

Run directly against production:

```bash
npm run test:e2e:live
```

Run against staging or another environment:

```bash
E2E_BASE_URL=https://your-staging-host npm run test:e2e
```

Optional authenticated checks use environment variables from `.env.local` or your shell:

- `E2E_TRAINER_EMAIL`
- `E2E_TRAINER_PASSWORD`
- `E2E_MEMBER_EMAIL`
- `E2E_MEMBER_PASSWORD`
- `E2E_ADMIN_PASSWORD`

If those variables are missing, the protected tests are skipped automatically and only the public smoke suite runs.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.
