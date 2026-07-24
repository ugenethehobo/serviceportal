# ServicePortal deployment guide

This document covers database setup, environment configuration, storage buckets, and scheduled jobs for production (or staging) deployments.

## Prerequisites

- [Supabase](https://supabase.com) project (Postgres + Auth + Storage)
- [Vercel](https://vercel.com) project (or compatible Node host for Next.js)
- [Stripe](https://stripe.com) account (Connect for client payments + Billing for platform subscriptions)
- [Resend](https://resend.com) account (transactional email)
- Optional: [Textbelt](https://textbelt.com) key for SMS notifications
- Optional: self-hosted or public [OSRM](http://project-osrm.org/) instance for road routing on the dashboard map

## Environment variables

Copy `.env.example` to `.env.local` for local development. Set the same values in your hosting provider for production.

### Required

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (browser + RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin access (bypasses RLS) |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL, e.g. `https://app.yourdomain.com` |
| `NEXT_PUBLIC_ADMIN_EMAIL` | Platform admin login email (`/admin`) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe Connect webhook signing secret (`/api/stripe/webhook`) |
| `RESEND_API_KEY` | Resend API key for email notifications |
| `RESEND_FROM_EMAIL` | Verified sender address in Resend |
| `CRON_SECRET` | Bearer token for `/api/cron/notifications` |

### Platform billing (Basic / Pro subscriptions)

| Variable | Purpose |
|----------|---------|
| `STRIPE_PLATFORM_PRICE_BASIC` | Stripe monthly Price ID for Basic plan |
| `STRIPE_PLATFORM_PRICE_PRO` | Stripe monthly Price ID for Pro plan |
| `STRIPE_PLATFORM_PRICE_BASIC_ANNUAL` | Stripe annual Price ID for Basic (optional; enables annual toggle) |
| `STRIPE_PLATFORM_PRICE_PRO_ANNUAL` | Stripe annual Price ID for Pro (optional; enables annual toggle) |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Platform billing webhook secret (`/api/stripe/billing/webhook`). Falls back to `STRIPE_WEBHOOK_SECRET` if unset. |

### QuickBooks Online (Pro integrations)

| Variable | Purpose |
|----------|---------|
| `QUICKBOOKS_CLIENT_ID` | Intuit app client ID |
| `QUICKBOOKS_CLIENT_SECRET` | Intuit app client secret |
| `QUICKBOOKS_REDIRECT_URI` | OAuth callback URL. Defaults to `{NEXT_PUBLIC_APP_URL}/api/integrations/quickbooks/callback` |
| `QUICKBOOKS_ENVIRONMENT` | `sandbox` (default) or `production` |
| `QUICKBOOKS_OAUTH_STATE_SECRET` | HMAC secret for OAuth state. **Required in production.** Local dev may fall back to `SUPABASE_SERVICE_ROLE_KEY`. |

Register the redirect URI in the [Intuit Developer Portal](https://developer.intuit.com/). P0 stores OAuth tokens only — invoice/payment sync is deferred to P3.

### Google Calendar (Pro integrations)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CALENDAR_CLIENT_ID` | Google Cloud OAuth client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Google Cloud OAuth client secret |
| `GOOGLE_CALENDAR_REDIRECT_URI` | OAuth callback URL. Defaults to `{NEXT_PUBLIC_APP_URL}/api/integrations/google-calendar/callback` |
| `GOOGLE_CALENDAR_OAUTH_STATE_SECRET` | HMAC secret for OAuth state. **Required in production.** Local dev may fall back to `SUPABASE_SERVICE_ROLE_KEY`. |

Enable the Google Calendar API in [Google Cloud Console](https://console.cloud.google.com/) and add the redirect URI to your OAuth client. P1 ships one-way export: jobs → calendar events.

### Optional

| Variable | Purpose |
|----------|---------|
| `TEXTBELT_API_KEY` | SMS via Textbelt. Defaults to `textbelt` (1 free SMS/day). |
| `OSRM_BASE_URL` | OSRM server base URL for route geometry. Defaults to the public demo server. |
| `ENABLE_JOB_PAYMENT_PLANS` | Kill switch for plan materialize/rebalance/plan UI. Default: enabled when unset. Set `false` only for emergency rollback; leave unset in normal production. |

## Supabase Auth (password reset)

Password reset links land on `/auth/callback` first, then `/login/reset-password`.

### Sending via Resend (recommended)

When `RESEND_API_KEY` is set, password reset emails are sent through **Resend** (same as other app notifications). The app generates a recovery token with the Supabase Admin API and emails a branded reset link — **Supabase’s built-in email quota is not used**.

Requirements:

- `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` (see `.env.example`)
- `SUPABASE_SERVICE_ROLE_KEY` (already required for server actions)

### Fallback without Resend

If `RESEND_API_KEY` is unset, resets fall back to `supabase.auth.resetPasswordForEmail`, which uses Supabase’s default mailer (very limited on the free tier). For production without Resend API, configure **Custom SMTP** in Supabase → Authentication → Email → SMTP Settings using [Resend SMTP](https://resend.com/docs/send-with-supabase-smtp) (`smtp.resend.com`, port `465`, user `resend`, password = your API key).

### Redirect URLs

In Supabase Dashboard → **Authentication** → **URL configuration**, add:

| Environment | URL |
|-------------|-----|
| Local | `http://localhost:3000/auth/callback` |
| Production | `{NEXT_PUBLIC_APP_URL}/auth/callback` |

Set **Site URL** to your canonical app URL (`NEXT_PUBLIC_APP_URL`).

## Database migrations

All SQL files live in `supabase/`. Run them in the **Supabase SQL editor** (or via `psql`) in the order below.

> **Greenfield:** Run every file in order starting with `schema-baseline.sql`.
>
> **Existing production DB:** Skip `schema-baseline.sql` if core tables already exist. Run only migrations you have not applied yet. All incremental files use `IF NOT EXISTS` / `DROP POLICY IF EXISTS` patterns where possible.

### Migration order

| # | File | Notes |
|---|------|-------|
| 1 | `schema-baseline.sql` | Core tables: `companies`, `profiles`, `clients`, `crews`, `schedules` |
| 2 | `recurring-rules-schema.sql` | `recurring_rules` table + FK on `schedules.recurring_rule_id` |
| 3 | `billing-schema.sql` | `billing_line_items`, `billing_payments` |
| 4 | `estimates-schema.sql` | `estimates`, `estimate_line_items`, `client_documents` |
| 5 | `portal-schema.sql` | Client portal columns + baseline RLS policies |
| 6 | `stripe-connect-schema.sql` | Stripe Connect columns on `companies` |
| 7 | `company-address-schema.sql` | Structured address fields on `companies` |
| 8 | `client-address-schema.sql` | Structured address fields on `clients` |
| 9 | `business-hours-schema.sql` | `business_hours_start` / `business_hours_end` on `companies` |
| 10 | `theme-schema.sql` | `theme_preference` on `profiles` + self-update policy |
| 11 | `schedules-cancelled-status.sql` | Adds `cancelled` to schedule status check |
| 12 | `company-logos-storage.sql` | `company-logos` storage bucket + read policy |
| 13 | `notifications-schema.sql` | `notification_settings` on `companies`, `notification_log` table |
| 14 | `job-photos-schema.sql` | `job_photos` table + RLS |
| 15 | `rls-fix.sql` | Security-definer helpers + non-recursive RLS (incl. `job_photos`) |
| 16 | `leads-schema.sql` | `leads`, `lead_activities` (requires `rls-fix.sql` helpers) |
| 17 | `messaging-schema.sql` | `message_threads`, `messages` |
| 18 | `job-photo-categories.sql` | `job_photo_categories` on `companies` |
| 19 | `document-uploads-schema.sql` | Manual upload columns on `client_documents`, `document_categories` |
| 20 | `invoices-schema.sql` | Invoice PDF support (`invoice_template`, `source = 'invoice'`) |
| 21 | `integrations-schema.sql` | `company_integrations` (Zapier, QuickBooks, Google Calendar) |
| 22 | `platform-billing-schema.sql` | Platform Stripe subscription columns on `companies` |
| 23 | `platform-signup-schema.sql` | Seat limits, trials, `platform_signup_checkouts` |
| 24 | `platform-trial-schema.sql` | Backfill / expire trial companies (data migration) |
| 25 | `company-solo-schema.sql` | `is_solo_business` on `companies` |
| 26 | `document-templates-schema.sql` | Unified `document_templates` JSONB on `companies` |
| 27 | `booking-schema.sql` | Public client booking mode, slug, bookable services |
| 28 | `google-calendar-schema.sql` | `google_calendar_event_id` on `schedules` |
| 29 | `onboarding-schema.sql` | Company onboarding progress columns |
| 30 | `personalization-schema.sql` | Company-wide `accent_color` and `background_image_url` |
| 31 | `user-backgrounds-storage.sql` | `user-backgrounds` storage bucket |
| 32 | `recurring-occurrence-origin.sql` | Recurring occurrence origin tracking on `schedules` |
| 33 | `production-rls-hardening.sql` | RLS on `crews`, `bookable_services`, etc.; company-scoped storage reads |
| 34 | `schedule-helpers-schema.sql` | Multi-tech job helpers (`schedule_helpers`) for field ops P4 |
| 35 | `crew-label-schema.sql` | Customizable `crew_label` on `companies` (default "Crews") |
| 36 | `portal-multi-login-schema.sql` | Multiple client portal logins per client (drop unique on `profiles.client_id`) |
| 37 | `job-payment-plan-schema.sql` | Multi-payment job plans (`job_payment_plans`, `billing_installments`, company/series templates) |
| 38 | `portal-access-expiry-schema.sql` | Per-login portal access expiry (`profiles.portal_access_expires_at`; NULL = no limit) |

> **Security:** Run `production-rls-hardening.sql` before exposing the app to real customers. It replaces the global `company-logos` read policy with company-scoped storage policies.

### Quick checklist for common feature gaps

| Symptom | Migration to run |
|---------|------------------|
| Recurring jobs fail on create | `recurring-rules-schema.sql` |
| Job cancel button errors | `schedules-cancelled-status.sql` |
| Logo upload fails | `company-logos-storage.sql` + bucket (below) |
| Notifications settings missing | `notifications-schema.sql` |
| Zapier / integrations settings missing | `integrations-schema.sql` |
| Visual invoice/estimate templates missing | `document-templates-schema.sql` |
| Document template editor shows column error | `document-templates-schema.sql` |
| Onboarding wizard missing columns | `onboarding-schema.sql` |
| Company branding (background/accent) fails | `personalization-schema.sql` + `user-backgrounds-storage.sql` |
| Custom crew label / nav still says wrong name | `crew-label-schema.sql` |
| Cannot add second portal login for a client | `portal-multi-login-schema.sql` |
| Job payment plans / installments missing | `job-payment-plan-schema.sql` |
| Cross-tenant data visible in browser | `production-rls-hardening.sql` |

## Storage buckets

Create these **private** buckets in Supabase Dashboard → Storage if not created by SQL:

| Bucket | Public | Created by | Used for |
|--------|--------|------------|----------|
| `company-logos` | No | `company-logos-storage.sql` | Company logo uploads |
| `client-documents` | No | Manual (see `estimates-schema.sql` comment) | Estimate/invoice PDFs, client file uploads |
| `job-photos` | No | Manual (see `job-photos-schema.sql` comment) | Job site photos |
| `user-avatars` | No | Manual | Profile avatar images |
| `user-backgrounds` | No | `user-backgrounds-storage.sql` | Company background images (`{companyId}/background/...`) |

For `client-documents`, `job-photos`, and `user-avatars`, configure storage policies so authenticated staff can read/write objects for their company. After migration #33, authenticated reads are company-scoped (or user-scoped for avatars). Server actions use the **service role** for uploads; browser clients use signed URLs where applicable.

## Stripe webhooks

Register two webhook endpoints in the Stripe Dashboard (or one endpoint with separate secrets if you prefer):

| Endpoint | Events (typical) |
|----------|------------------|
| `{APP_URL}/api/stripe/webhook` | Connect: `payment_intent.succeeded`, `account.updated`, etc. |
| `{APP_URL}/api/stripe/billing/webhook` | Billing: `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed` |

Set `STRIPE_WEBHOOK_SECRET` and `STRIPE_BILLING_WEBHOOK_SECRET` to the corresponding signing secrets.

### Ledger overpayment refuse (`LEDGER_OVERPAYMENT`)

If a card payment succeeds on Stripe but the app refuses to write `billing_payments` (double-charge race past job balance):

1. Logs: search for `[LEDGER_OVERPAYMENT]` — includes `paymentIntentId`, `scheduleId`, `amount`, `balanceDue`.
2. **Do not** force a ledger row. Refund the PaymentIntent (or excess) in **Stripe Dashboard** for the connected account.
3. Client toast/API message already tells them to contact the business for a refund.
4. Webhook returns 200 on refuse so Stripe does not retry forever.

## Cron jobs

### Lead follow-up notifications

**Route:** `GET /api/cron/notifications`

**Schedule:** Daily (e.g. 8:00 AM company-local — Vercel Cron uses UTC; adjust as needed)

**Authorization:** `Authorization: Bearer {CRON_SECRET}`

**Vercel example** (`vercel.json`):

```json
{
  "crons": [
    {
      "path": "/api/cron/notifications",
      "schedule": "0 14 * * *"
    }
  ]
}
```

Set `CRON_SECRET` in Vercel environment variables. The route returns `{ sent, skipped }` counts for lead follow-up reminder emails/SMS.

### Schedule status sync (recurring jobs)

Recurring job generation runs when schedule statuses are synced (archived past jobs spawn the next occurrence). This is triggered from the client dashboard when viewing a client's jobs. No separate cron is required today, but you may add one later that calls the underlying sync for all active clients.

## Phase 2: Staging / beta infrastructure

Use this checklist after Phase 1 (security hardening) and before inviting real customers.

### 1. Verify database migrations

From the project root:

```bash
npm run verify:schema
```

Apply any **MISS** migrations in Supabase → SQL editor, in the order listed in the migration table above. For a greenfield staging project, run migrations **1–33** in sequence.

After applying `production-rls-hardening.sql`, confirm cross-tenant isolation: two test companies should not see each other's `crews`, storage objects, or documents via the browser client.

### 2. Configure Supabase Auth

In Supabase Dashboard → **Authentication** → **URL configuration**:

| Setting | Staging / production value |
|---------|----------------------------|
| Site URL | `{NEXT_PUBLIC_APP_URL}` |
| Redirect URLs | `{NEXT_PUBLIC_APP_URL}/auth/callback` |

### 3. Create Vercel project and env vars

1. Import the Git repo into [Vercel](https://vercel.com).
2. Set **Production** environment variables (copy from `.env.example`; use `npm run check:env:production` locally to audit).
3. Generate dedicated secrets for production:
   - `CRON_SECRET` — random 32+ character string
   - `QUICKBOOKS_OAUTH_STATE_SECRET` — random 32+ character string
   - `GOOGLE_CALENDAR_OAUTH_STATE_SECRET` — random 32+ character string
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain (e.g. `https://servport.pro` or `https://app.yourdomain.com`).

`vercel.json` already configures the daily notifications cron. Ensure `CRON_SECRET` is set in Vercel before the first cron run.

### 4. External service callbacks

Register these URLs using your deployed `NEXT_PUBLIC_APP_URL`:

| Service | URL |
|---------|-----|
| Stripe Connect webhook | `{APP_URL}/api/stripe/webhook` |
| Stripe Billing webhook | `{APP_URL}/api/stripe/billing/webhook` |
| QuickBooks OAuth | `{APP_URL}/api/integrations/quickbooks/callback` |
| Google Calendar OAuth | `{APP_URL}/api/integrations/google-calendar/callback` |
| Supabase Auth callback | `{APP_URL}/auth/callback` |

Use **Stripe test mode** for beta unless you are ready for live charges.

### 5. Post-deploy verification

```bash
curl https://your-app.example.com/api/health
```

Expect `{ "ok": true, "checks": { ... } }` with all checks `ok`. Then run the smoke-test checklist below.

## Deploy steps (summary)

1. Create Supabase project; note URL and API keys.
2. Run SQL migrations in order (table above).
3. Create storage buckets and policies.
4. Configure Stripe products/prices; set platform price env vars.
5. Configure Resend domain/sender.
6. Set all environment variables in Vercel.
7. Deploy Next.js app (`npm run build` must pass).
8. Register Stripe webhooks pointing at production URLs.
9. Add Vercel cron for `/api/cron/notifications`.
10. Smoke-test (see checklist below).

### Production smoke-test checklist

- [ ] Staff signup and company onboarding complete
- [ ] Create client, schedule job, recurring job spawns next occurrence
- [ ] Send estimate; client portal login and document download
- [ ] Stripe Connect onboarding (company admin only)
- [ ] Collect portal payment on a job with balance due
- [ ] Upload company logo and background; accent color visible to team member
- [ ] Team member cannot edit company branding (read-only)
- [ ] QuickBooks / Google Calendar OAuth connect (Pro, admin only)
- [ ] Zapier test webhook
- [ ] Password reset email (Resend)
- [ ] Cron notifications route with `CRON_SECRET`

## Local development

```bash
cp .env.example .env.local
# fill in Supabase + Stripe test keys
npm install
npm run dev
```

Apply the same migration order against your dev Supabase project. Use Stripe CLI to forward webhooks locally:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```