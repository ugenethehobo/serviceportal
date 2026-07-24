-- Job payment plans / installments (client job billing — not platform SaaS).
-- Migration #37. Run in Supabase SQL editor after #36.
-- See docs/design-flexible-multi-payment-billing.md

-- ---------------------------------------------------------------------------
-- Company + series templates
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists job_payment_settings jsonb not null default '{}'::jsonb;

comment on column public.companies.job_payment_settings is
  'Default client job payment plan template. Not platform SaaS billing.';

alter table public.recurring_rules
  add column if not exists payment_plan_template jsonb;

comment on column public.recurring_rules.payment_plan_template is
  'Series payment plan snapshot. null = live inherit companies.job_payment_settings.';

-- ---------------------------------------------------------------------------
-- Per-job plan
-- ---------------------------------------------------------------------------

create table if not exists public.job_payment_plans (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null unique references public.schedules(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_type text not null check (plan_type in (
    'full_balance', 'deposit_remainder', 'custom_installments'
  )),
  template jsonb not null default '{}'::jsonb,
  source text not null default 'company_default' check (source in (
    'company_default', 'series_default', 'job_override', 'legacy_none'
  )),
  allow_pay_ahead boolean not null default true,
  lock_portal_to_due_now boolean not null default false,
  needs_attention boolean not null default false,
  needs_attention_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_payment_plans_company_id_idx
  on public.job_payment_plans(company_id);

create index if not exists job_payment_plans_client_id_idx
  on public.job_payment_plans(client_id);

-- ---------------------------------------------------------------------------
-- Installments (materialized per schedule)
-- ---------------------------------------------------------------------------

create table if not exists public.billing_installments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  job_payment_plan_id uuid not null references public.job_payment_plans(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  sequence int not null check (sequence > 0),
  key text not null,
  label text not null,
  amount_due numeric not null check (amount_due >= 0),
  due_date date,
  collectible_policy jsonb not null default '{"when":"on_or_after_visit_start"}'::jsonb,
  status text not null default 'pending' check (status in (
    'pending', 'partial', 'paid', 'superseded'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_installments_schedule_id_idx
  on public.billing_installments(schedule_id);

create index if not exists billing_installments_plan_id_idx
  on public.billing_installments(job_payment_plan_id);

-- Partial uniques: only non-superseded rows compete for key/sequence.
create unique index if not exists billing_installments_schedule_sequence_active_uidx
  on public.billing_installments (schedule_id, sequence)
  where status <> 'superseded';

create unique index if not exists billing_installments_schedule_key_active_uidx
  on public.billing_installments (schedule_id, key)
  where status <> 'superseded';

-- ---------------------------------------------------------------------------
-- Link payments → installments (optional; FIFO when null)
-- ---------------------------------------------------------------------------

alter table public.billing_payments
  add column if not exists installment_id uuid
    references public.billing_installments(id) on delete set null;

create index if not exists billing_payments_installment_id_idx
  on public.billing_payments(installment_id);

-- ---------------------------------------------------------------------------
-- RLS (mirror billing_line_items / billing_payments)
-- ---------------------------------------------------------------------------

alter table public.job_payment_plans enable row level security;
alter table public.billing_installments enable row level security;

drop policy if exists job_payment_plans_staff_all on public.job_payment_plans;
create policy job_payment_plans_staff_all on public.job_payment_plans
  for all using (
    auth_is_company_staff()
    and job_payment_plans.company_id = auth_profile_company_id()
  );

drop policy if exists job_payment_plans_client_select on public.job_payment_plans;
create policy job_payment_plans_client_select on public.job_payment_plans
  for select using (
    auth_is_client_portal()
    and job_payment_plans.client_id = auth_profile_client_id()
    and exists (
      select 1 from public.clients c
      where c.id = auth_profile_client_id()
        and c.portal_enabled = true
    )
  );

drop policy if exists billing_installments_staff_all on public.billing_installments;
create policy billing_installments_staff_all on public.billing_installments
  for all using (
    auth_is_company_staff()
    and billing_installments.company_id = auth_profile_company_id()
  );

drop policy if exists billing_installments_client_select on public.billing_installments;
create policy billing_installments_client_select on public.billing_installments
  for select using (
    auth_is_client_portal()
    and billing_installments.client_id = auth_profile_client_id()
    and exists (
      select 1 from public.clients c
      where c.id = auth_profile_client_id()
        and c.portal_enabled = true
    )
  );

-- No client INSERT/UPDATE/DELETE on plan tables (mutations via service role).
