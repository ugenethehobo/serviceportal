-- Beta feedback submissions from in-app widget.
-- Run in Supabase SQL editor.

create table if not exists beta_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  feedback_type text not null check (feedback_type in ('bug', 'feature', 'other')),
  message text not null,
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  page_url text,
  user_agent text,
  submitter_user_id uuid,
  submitter_email text,
  submitter_name text,
  submitter_role text,
  company_id uuid references companies(id) on delete set null,
  company_name text,
  metadata jsonb
);

create index if not exists beta_feedback_created_at_idx
  on beta_feedback (created_at desc);

create index if not exists beta_feedback_status_idx
  on beta_feedback (status);

create index if not exists beta_feedback_type_idx
  on beta_feedback (feedback_type);