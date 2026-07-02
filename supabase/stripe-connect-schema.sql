-- Run in Supabase SQL editor — adds per-company Stripe Connect fields.

alter table companies add column if not exists stripe_account_id text;
alter table companies add column if not exists stripe_charges_enabled boolean not null default false;
alter table companies add column if not exists stripe_onboarding_complete boolean not null default false;

create unique index if not exists companies_stripe_account_id_idx on companies(stripe_account_id)
  where stripe_account_id is not null;