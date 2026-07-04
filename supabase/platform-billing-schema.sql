-- Platform subscription billing (Stripe Billing for tenant companies).
-- Run in Supabase SQL editor.

alter table companies add column if not exists stripe_platform_customer_id text;
alter table companies add column if not exists stripe_platform_subscription_id text;
alter table companies add column if not exists subscription_plan text not null default 'trial';
alter table companies add column if not exists subscription_status text not null default 'trialing';

create unique index if not exists companies_stripe_platform_customer_id_idx
  on companies(stripe_platform_customer_id)
  where stripe_platform_customer_id is not null;

create unique index if not exists companies_stripe_platform_subscription_id_idx
  on companies(stripe_platform_subscription_id)
  where stripe_platform_subscription_id is not null;