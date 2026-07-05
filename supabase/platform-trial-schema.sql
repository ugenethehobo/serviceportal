-- Free trial enforcement: backfill trial end dates for companies already on trial.
-- Run in Supabase SQL editor (after platform-billing-schema.sql and platform-signup-schema.sql).

-- Backfill trial_ends_at for trial companies missing an end date (14 days from created_at).
update companies
set
  trial_ends_at = created_at + interval '14 days',
  subscription_plan = coalesce(nullif(subscription_plan, ''), 'trial'),
  subscription_status = case
    when created_at + interval '14 days' <= now() then 'trial_expired'
    else coalesce(nullif(subscription_status, ''), 'trialing')
  end
where
  subscription_plan = 'trial'
  and trial_ends_at is null
  and created_at is not null;

-- Mark expired trials that have a past trial_ends_at but stale status.
update companies
set subscription_status = 'trial_expired'
where
  subscription_plan = 'trial'
  and trial_ends_at is not null
  and trial_ends_at <= now()
  and subscription_status = 'trialing';