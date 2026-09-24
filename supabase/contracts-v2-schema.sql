-- Contracts v2: template library, uploaded PDF templates, per-contract snapshots,
-- multiple contracts per job/client, and a signing audit trail.
-- Run AFTER contracts-schema.sql.

-- ---------------------------------------------------------------------------
-- Template library
-- ---------------------------------------------------------------------------

alter table public.contract_templates
  add column if not exists is_default boolean not null default false,
  add column if not exists description text,
  add column if not exists source_type text not null default 'builder';

alter table public.contract_templates drop constraint if exists contract_templates_source_type_check;
alter table public.contract_templates
  add constraint contract_templates_source_type_check
  check (source_type in ('builder', 'pdf'));

-- The v1 catch-all template becomes the company default.
update public.contract_templates
set is_default = true
where service_package_id is null
  and not exists (
    select 1 from public.contract_templates other
    where other.company_id = contract_templates.company_id
      and other.is_default
  );

-- v1 allowed exactly one template without a service package. The library allows many.
drop index if exists public.contract_templates_company_default_uidx;

create unique index if not exists contract_templates_company_is_default_uidx
  on public.contract_templates (company_id)
  where is_default;

-- ---------------------------------------------------------------------------
-- Service package -> template assignment (many packages may share a template)
-- ---------------------------------------------------------------------------

alter table public.bookable_services
  add column if not exists contract_template_id uuid
    references public.contract_templates(id) on delete set null;

update public.bookable_services bs
set contract_template_id = ct.id
from public.contract_templates ct
where ct.service_package_id = bs.id
  and ct.company_id = bs.company_id
  and bs.contract_template_id is null;

-- Package ownership now lives on bookable_services; templates are shared library items.
update public.contract_templates
set service_package_id = null
where service_package_id is not null;

-- ---------------------------------------------------------------------------
-- Contract instances
-- ---------------------------------------------------------------------------

alter table public.contracts
  add column if not exists template_snapshot jsonb,
  add column if not exists client_signed_ip text,
  add column if not exists client_signed_user_agent text,
  add column if not exists reminder_sent_at timestamptz;

create index if not exists contracts_client_status_idx
  on public.contracts (client_id, status);
