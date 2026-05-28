# Production Environment Variables

This document lists all environment variables required to run ServicePortal in production.

**Important**: Never commit real secrets to git. Use `.env.local` for local development and your hosting platform's environment variable settings for production.

---

## Core Application

| Variable                    | Required | Description                                      | Example |
|----------------------------|----------|--------------------------------------------------|---------|
| `NEXT_PUBLIC_APP_URL`      | Yes      | The public base URL of your application          | `https://app.yourdomain.com` |
| `NEXT_PUBLIC_PUBLIC_URL`   | Recommended | Used during development/testing to override redirect URLs (e.g. ngrok) | `https://abc123.ngrok-free.dev` |

---

## Supabase

| Variable                              | Required | Description | Notes |
|---------------------------------------|----------|-------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL`            | Yes      | Your Supabase project URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`       | Yes      | Supabase anonymous/public key | Used on both client and server |
| `SUPABASE_SERVICE_ROLE_KEY`           | Yes      | Supabase Service Role key | **Never expose to the browser**. Used for admin operations (user creation, provisioning, etc.) |

---

## Stripe

### General Stripe Keys

| Variable                  | Required | Description | Notes |
|---------------------------|----------|-------------|-------|
| `STRIPE_SECRET_KEY`       | Yes      | Stripe secret key | Use `sk_live_...` in production |
| `STRIPE_WEBHOOK_SECRET`   | Yes      | Stripe webhook signing secret | Different for Test vs Live mode |

### Subscription Pricing

| Variable                    | Required | Description | Notes |
|-----------------------------|----------|-------------|-------|
| `STRIPE_PRICE_MONTHLY`      | Yes      | Stripe Price ID for monthly plan | Created in Stripe Dashboard |
| `STRIPE_PRICE_ANNUAL`       | Yes      | Stripe Price ID for annual plan | Created in Stripe Dashboard |

### Stripe Connect (Optional - for customer payments)

| Variable                              | Required | Description | Notes |
|---------------------------------------|----------|-------------|-------|
| `NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID` | Recommended | Stripe Connect OAuth Client ID | Required if you want customers to connect their own Stripe accounts |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`   | Optional  | Stripe publishable key | Currently used in some legacy flows |

---

## Owner / Admin Access

| Variable       | Required | Description | Example |
|----------------|----------|-------------|---------|
| `OWNER_EMAILS` | Yes      | Comma-separated list of emails allowed to access `/owner` | `you@yourdomain.com,partner@yourdomain.com` |

---

## Recommended Production Setup

### 1. Stripe Environment Separation

- **Test Mode**: Use for development and testing.
  - Keys start with `sk_test_` / `pk_test_`
  - Webhook secret starts with `whsec_`

- **Live Mode**: Use only in production.
  - Keys start with `sk_live_` / `pk_live_`
  - You must create a **separate webhook endpoint** in the Stripe Dashboard for Live mode.

**Never mix Test and Live keys.**

### 2. Supabase

- Use the same project for both development and production (or create separate projects).
- The `SUPABASE_SERVICE_ROLE_KEY` must only be used in server-side code (API routes, Server Actions, etc.).

### 3. Vercel / Hosting Platform

When deploying (e.g. to Vercel), add all variables in the project settings under **Settings → Environment Variables**.

Recommended environment groups:
- **Production**
- **Preview**
- **Development**

### 4. Webhook Configuration

You must configure **two separate webhooks** in Stripe:

1. **Test Webhook**
   - Endpoint: Your test domain or ngrok + `/api/webhooks/stripe`
   - Mode: Test
   - Events: See `app/api/webhooks/stripe/route.ts`

2. **Live Webhook**
   - Endpoint: `https://yourdomain.com/api/webhooks/stripe`
   - Mode: Live
   - Events: Same as above

Copy the **Live** signing secret into `STRIPE_WEBHOOK_SECRET` in your production environment.

---

## Example `.env.local` (Development)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Stripe (Test)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PUBLIC_URL=https://your-ngrok-url.ngrok-free.dev   # Optional during testing

# Owner Access
OWNER_EMAILS=you@yourdomain.com
```

---

## Security Notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `STRIPE_SECRET_KEY` to the browser.
- Rotate webhook secrets if they are ever leaked.
- Use different Stripe accounts or at minimum separate Test/Live modes.
- Consider adding a `.env.production` or using your platform's secret management.

---

## Quick Checklist Before Going Live

- [ ] All `sk_live_*` and `whsec_*` (live) secrets are set in production
- [ ] Live Stripe webhook is configured and pointing to production domain
- [ ] `OWNER_EMAILS` contains only trusted emails
- [ ] `NEXT_PUBLIC_APP_URL` points to your real domain
- [ ] Migration SQL from `MIGRATION-saas-platform.md` has been run in production Supabase
- [ ] You have tested a full purchase → onboarding → account creation flow in Live mode

---

Last updated: 2026-04-??

If you add new environment variables in the future, please update this document.