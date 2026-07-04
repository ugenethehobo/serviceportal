-- Run in Supabase SQL editor
-- Email/SMS notification preferences and delivery log.

alter table companies
  add column if not exists notification_settings jsonb not null default '{}'::jsonb;

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  event_type text not null,
  channel text not null check (channel in ('email', 'sms')),
  recipient text not null,
  subject text,
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  error_message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notification_log_company_id_idx on notification_log(company_id);
create index if not exists notification_log_event_type_idx on notification_log(event_type);
create index if not exists notification_log_created_at_idx on notification_log(created_at desc);