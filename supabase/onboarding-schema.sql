-- Company onboarding wizard (one-time setup for new accounts)
alter table companies
  add column if not exists onboarding_completed boolean not null default true,
  add column if not exists onboarding_completed_at timestamptz;

comment on column companies.onboarding_completed is
  'False for brand-new companies until the setup wizard finishes. Defaults true so existing companies are unaffected.';
comment on column companies.onboarding_completed_at is
  'Timestamp when the company completed the initial onboarding wizard.';