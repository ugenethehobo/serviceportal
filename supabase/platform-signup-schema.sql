-- Platform self-serve signup: seats, trials, and checkout session tracking.
-- Run in Supabase SQL editor (after platform-billing-schema.sql).

alter table companies add column if not exists seat_limit integer not null default 10;
alter table companies add column if not exists trial_ends_at timestamptz;
alter table companies add column if not exists promo_code text;

create table if not exists platform_signup_checkouts (
  id uuid primary key default gen_random_uuid(),
  stripe_checkout_session_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null check (plan in ('basic', 'pro')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'claimed', 'expired')),
  company_id uuid references companies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_signup_checkouts_status_idx
  on platform_signup_checkouts(status);