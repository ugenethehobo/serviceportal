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
| `STRIPE_PLATFORM_PRICE_BASIC` | Stripe Price ID for Basic plan |
| `STRIPE_PLATFORM_PRICE_PRO` | Stripe Price ID for Pro plan |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Platform billing webhook secret (`/api/stripe/billing/webhook`). Falls back to `STRIPE_WEBHOOK_SECRET` if unset. |

### QuickBooks Online (Pro integrations)

| Variable | Purpose |
|----------|---------|
| `QUICKBOOKS_CLIENT_ID` | Intuit app client ID |
| `QUICKBOOKS_CLIENT_SECRET` | Intuit app client secret |
| `QUICKBOOKS_REDIRECT_URI` | OAuth callback URL. Defaults to `{NEXT_PUBLIC_APP_URL}/api/integrations/quickbooks/callback` |
| `QUICKBOOKS_ENVIRONMENT` | `sandbox` (default) or `production` |
| `QUICKBOOKS_OAUTH_STATE_SECRET` | HMAC secret for OAuth state. Defaults to `SUPABASE_SERVICE_ROLE_KEY` |

Register the redirect URI in the [Intuit Developer Portal](https://developer.intuit.com/). P0 stores OAuth tokens only — invoice/payment sync is deferred to P3.

### Google Calendar (Pro integrations)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CALENDAR_CLIENT_ID` | Google Cloud OAuth client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Google Cloud OAuth client secret |
| `GOOGLE_CALENDAR_REDIRECT_URI` | OAuth callback URL. Defaults to `{NEXT_PUBLIC_APP_URL}/api/integrations/google-calendar/callback` |
| `GOOGLE_CALENDAR_OAUTH_STATE_SECRET` | HMAC secret for OAuth state. Defaults to `SUPABASE_SERVICE_ROLE_KEY` |

Enable the Google Calendar API in [Google Cloud Console](https://console.cloud.google.com/) and add the redirect URI to your OAuth client. P1 ships one-way export: jobs → calendar events.

### Optional

| Variable | Purpose |
|----------|---------|
| `TEXTBELT_API_KEY` | SMS via Textbelt. Defaults to `textbelt` (1 free SMS/day). |
| `OSRM_BASE_URL` | OSRM server base URL for route geometry. Defaults to the public demo server. |

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

## Storage buckets

Create these **private** buckets in Supabase Dashboard → Storage if not created by SQL:

| Bucket | Public | Created by | Used for |
|--------|--------|------------|----------|
| `company-logos` | No | `company-logos-storage.sql` | Company logo uploads |
| `client-documents` | No | Manual (see `estimates-schema.sql` comment) | Estimate/invoice PDFs, client file uploads |
| `job-photos` | No | Manual (see `job-photos-schema.sql` comment) | Job site photos |
| `user-avatars` | No | Manual | Profile avatar images |

For `client-documents`, `job-photos`, and `user-avatars`, configure storage policies so authenticated staff can read/write objects for their company. Server actions use the **service role** for uploads; browser clients use signed URLs where applicable.

## Stripe webhooks

Register two webhook endpoints in the Stripe Dashboard (or one endpoint with separate secrets if you prefer):

| Endpoint | Events (typical) |
|----------|------------------|
| `{APP_URL}/api/stripe/webhook` | Connect: `payment_intent.succeeded`, `account.updated`, etc. |
| `{APP_URL}/api/stripe/billing/webhook` | Billing: `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed` |

Set `STRIPE_WEBHOOK_SECRET` and `STRIPE_BILLING_WEBHOOK_SECRET` to the corresponding signing secrets.

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
10. Smoke-test: signup, create client, schedule job, send estimate, upload logo, Zapier test webhook.

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