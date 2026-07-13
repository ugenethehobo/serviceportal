-- Stripe webhook idempotency log (service role only — no authenticated policies).
-- Run in Supabase SQL editor before production webhook hardening.

create table if not exists stripe_webhook_events (
  id text primary key,
  source text not null check (source in ('connect', 'billing')),
  event_type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_processed_at_idx
  on stripe_webhook_events(processed_at desc);

alter table public.stripe_webhook_events enable row level security;