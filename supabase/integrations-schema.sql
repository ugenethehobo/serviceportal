-- Third-party integrations per company.
-- Run in Supabase SQL editor.

create table if not exists company_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  provider text not null check (provider in ('quickbooks', 'google_calendar', 'zapier')),
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connected', 'error')),
  config jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (company_id, provider)
);

create index if not exists company_integrations_company_id_idx
  on company_integrations(company_id);

alter table company_integrations enable row level security;

drop policy if exists company_integrations_staff_all on company_integrations;
create policy company_integrations_staff_all on company_integrations
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.company_id = company_integrations.company_id
        and p.role in ('company_admin', 'team_member')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.company_id = company_integrations.company_id
        and p.role = 'company_admin'
    )
  );