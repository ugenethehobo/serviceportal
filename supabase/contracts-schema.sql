-- Contracts: templates, instances, and client_documents linkage.
-- Run AFTER schema-baseline.sql, booking-schema.sql, and estimates-schema.sql.

-- ---------------------------------------------------------------------------
-- Contract templates (catch-all + per service package)
-- ---------------------------------------------------------------------------

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_package_id uuid references public.bookable_services(id) on delete cascade,
  name text not null default 'Contract template',
  template jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contract_templates_company_default_uidx
  on public.contract_templates (company_id)
  where service_package_id is null;

create unique index if not exists contract_templates_company_package_uidx
  on public.contract_templates (company_id, service_package_id)
  where service_package_id is not null;

create index if not exists contract_templates_company_id_idx
  on public.contract_templates (company_id);

-- ---------------------------------------------------------------------------
-- Contract instances (Phase 2+ lifecycle; schema included for migrations)
-- ---------------------------------------------------------------------------

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  schedule_id uuid references public.schedules(id) on delete set null,
  contract_template_id uuid references public.contract_templates(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'ready_for_signing', 'signed', 'void')),
  title text not null,
  field_values jsonb not null default '{}'::jsonb,
  client_signature_storage_path text,
  client_initials_storage_path text,
  client_signed_at timestamptz,
  client_signed_name text,
  sent_at timestamptz,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contracts_company_id_idx on public.contracts (company_id);
create index if not exists contracts_client_id_idx on public.contracts (client_id);
create index if not exists contracts_schedule_id_idx on public.contracts (schedule_id);
create index if not exists contracts_status_idx on public.contracts (status);

-- ---------------------------------------------------------------------------
-- client_documents: contract source + FK
-- ---------------------------------------------------------------------------

alter table public.client_documents
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

alter table public.client_documents drop constraint if exists client_documents_source_check;

alter table public.client_documents
  add constraint client_documents_source_check
  check (source in ('estimate', 'upload', 'invoice', 'contract'));

create index if not exists client_documents_contract_id_idx
  on public.client_documents (contract_id)
  where contract_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;

drop policy if exists contract_templates_staff_all on public.contract_templates;
create policy contract_templates_staff_all on public.contract_templates
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = contract_templates.company_id
        and p.role in ('company_admin', 'staff')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = contract_templates.company_id
        and p.role in ('company_admin', 'staff')
    )
  );

drop policy if exists contracts_staff_all on public.contracts;
create policy contracts_staff_all on public.contracts
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = contracts.company_id
        and p.role in ('company_admin', 'staff')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.company_id = contracts.company_id
        and p.role in ('company_admin', 'staff')
    )
  );

drop policy if exists contracts_client_select on public.contracts;
create policy contracts_client_select on public.contracts
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.client_id = contracts.client_id
        and p.role = 'client'
    )
  );