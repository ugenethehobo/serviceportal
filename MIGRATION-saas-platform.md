# ServicePortal SaaS Platform Migration: Multi-Tenancy, Subscriptions & Onboarding

**Date**: Execution start after plan approval  
**Goal**: Introduce proper company tenancy, subscription tracking, and intake provisioning so the product can be sold as a subscription SaaS with automated onboarding and owner visibility.
**Status**: Draft for review. User must run the SQL in Supabase SQL Editor **before** Phase 1 code work.

---

## Problem Summary

The current application is built around a **per-user** model (`user_id` on nearly every table + RLS `auth.uid() = user_id`). This works for a solo prototype but cannot support:

- Multiple customers (companies) on one database
- Owner admin visibility across all subscriptions
- Proper intake form that seeds settings per paying customer
- Future multi-user teams inside one service company
- Clean subscription lifecycle management

We need to evolve to a **company-centric** multi-tenant model while preserving all existing functionality (Jobs, Clients, Portal, Calendar, Photos, Route Planner, etc.).

---

## Required Schema Changes (RUN THIS IN SUPABASE SQL EDITOR)

```sql
-- ============================================================
-- 1. NEW TABLES
-- ============================================================

-- Companies (the new primary tenant entity)
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_customer_id text,
  subscription_status text NOT NULL DEFAULT 'trialing', -- trialing | active | past_due | canceled | unpaid
  trial_ends_at timestamptz,
  onboarding_completed_at timestamptz,
  notes text,                    -- owner-only internal notes
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Subscriptions (local mirror of Stripe subscriptions)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  status text NOT NULL,          -- active, trialing, past_due, canceled, etc.
  plan text,                     -- 'monthly' | 'annual' (or price lookup key)
  current_period_end timestamptz,
  amount integer,                -- in cents
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Temporary/audit storage for the post-purchase intake wizard
CREATE TABLE IF NOT EXISTS public.onboarding_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_checkout_session_id text,
  stripe_customer_id text,
  intake_data jsonb NOT NULL,    -- full wizard answers
  status text NOT NULL DEFAULT 'in_progress', -- in_progress | completed
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Junction for future multi-user support inside a company
CREATE TABLE IF NOT EXISTS public.company_users (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner', -- owner | admin | tech | viewer
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

-- ============================================================
-- 2. EXTEND EXISTING company_settings (switch to company_id)
-- ============================================================

-- Add company_id (nullable during migration)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Optional but recommended new fields seeded by intake
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS business_hours jsonb,           -- e.g. {"mon": {"start":"08:00","end":"17:00"}, ...}
  ADD COLUMN IF NOT EXISTS default_job_duration_minutes integer DEFAULT 60;

-- ============================================================
-- 2b. USAGE-BASED TRIAL SUPPORT ("first 3 clients free")
-- ============================================================

-- Track trial usage on the company (per locked decision: trial = first 3 clients, not time-based)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_clients_limit integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS trial_clients_used integer NOT NULL DEFAULT 0;

-- Note: Enforcement logic lives in application code (when creating clients).
-- If subscription_status is not 'active' (or trial is exhausted), block creation of 4th+ client.

-- ============================================================
-- 3. ADD company_id TO ALL CORE TENANT TABLES
-- ============================================================

ALTER TABLE public.clients          ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.jobs             ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.bills            ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.estimates        ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.estimate_items   ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.contracts        ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.contract_signatures ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.files            ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.messages           ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.portal_tokens      ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.leads              ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.user_stripe_settings ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- ============================================================
-- 4. BACKFILL FOR EXISTING DATA (IMPORTANT!)
-- ============================================================

-- If you have existing production data, you will need a one-time backfill.
-- The simplest safe approach for a solo developer instance:
-- 1. Create one "company" per existing user who has data.
-- 2. Set owner_user_id = the user.
-- 3. Update all rows for that user to the new company_id.

-- EXAMPLE backfill script (run after you have created companies for your test users):
/*
-- 1. One-time: create a company for each existing user who has settings
INSERT INTO public.companies (name, owner_user_id)
SELECT 
  COALESCE(cs.company_name, 'Untitled Company'),
  cs.user_id
FROM public.company_settings cs
ON CONFLICT DO NOTHING;

-- 2. Link the settings row
UPDATE public.company_settings cs
SET company_id = c.id
FROM public.companies c
WHERE cs.user_id = c.owner_user_id
  AND cs.company_id IS NULL;

-- 3. Propagate to all other tables (repeat pattern for every table)
UPDATE public.clients SET company_id = (
  SELECT company_id FROM public.company_settings WHERE user_id = clients.user_id
) WHERE company_id IS NULL;

-- Do the same UPDATE for jobs, bills, estimates, contracts, files, messages, portal_tokens, leads, user_stripe_settings, etc.

-- 4. After verification you can consider dropping the old user_id columns (or keep them for a while for safety).
*/

-- ============================================================
-- 5. RLS POLICY UPDATES (CRITICAL - RUN AFTER BACKFILL)
-- ============================================================

-- Enable RLS on new tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

-- Example policies (you will likely need to adjust based on your exact current policies).
-- These assume we have a helper or direct join to company_users / owner_user_id.

-- Companies: owners and members can see their own company
CREATE POLICY "Users can view their own company"
  ON public.companies FOR SELECT
  USING (
    owner_user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.company_users cu 
      WHERE cu.company_id = companies.id AND cu.user_id = auth.uid()
    )
  );

-- Similar policies needed for subscriptions, onboarding_intakes (more restrictive), etc.

-- For existing tables, you must change policies from:
--   USING (user_id = auth.uid())
-- to something like:
--   USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()))

-- You will need to review and rewrite every policy that currently filters by user_id.
-- Start with the most used tables: clients, jobs, company_settings, portal_tokens.

-- ============================================================
-- 6. INDEXES (recommended for performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_companies_owner ON public.companies(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_company ON public.subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_users_user ON public.company_users(user_id);
-- Add company_id indexes on all the tables you altered above.
```

---

## Design Decisions

- `company_id` becomes the new tenant key (preferred over keeping `user_id` as primary).
- `company_settings` moves from 1:1 with `user_id` → 1:1 with `company_id`.
- `onboarding_intakes` uses JSONB for maximum flexibility during the wizard (we copy the needed fields into the real tables on provisioning).
- Subscriptions are mirrored locally for fast queries in the owner admin (Stripe remains source of truth).
- RLS is updated to company membership (via `company_users` junction for future multi-user support).
- Existing `user_id` columns are left in place during migration for safety (can be dropped later after verification).
- **Trial model** (per user decision): "First 3 clients free" is usage-based, not time-based. We track `trial_clients_used` vs `trial_clients_limit` on the `companies` table. Paid subscription is required to create the 4th+ client. Enforcement happens in client creation code.

---

## Files That Will Change (High Level)

- New: `MIGRATION-saas-platform.md` (this file)
- New routes: `app/onboarding/**`, `app/owner/**`, `app/pricing/**`, `app/api/webhooks/stripe/**`
- Major refactors: `app/dashboard/layout.tsx`, all dashboard pages, portal token validation, settings, auth flows
- New lib helpers: `lib/company.ts`, `lib/subscription.ts`, onboarding utilities
- `app/(auth)/signup/page.tsx` will be largely superseded by the new flow

---

## Next Steps After Running This Migration

1. Verify a few rows have correct `company_id`.
2. Update RLS policies (the most error-prone part — test thoroughly with different users).
3. Proceed with Phase 1 code (pricing page + subscription checkout + webhook).

---

**Rollback note**: All changes use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` where possible. You can drop the new columns/tables if something goes wrong early.

Run the SQL, then let me know the results (any errors or successful verification queries) and we will continue with the first code changes.
