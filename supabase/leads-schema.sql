-- Run in Supabase SQL editor — leads pipeline for pre-client prospects.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  address_street text,
  address_unit text,
  address_city text,
  address_state text,
  address_zip text,
  source text not null default 'other' check (source in ('website', 'referral', 'phone', 'social', 'other')),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost', 'archived')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  follow_up_at timestamptz,
  notes text,
  estimated_value numeric check (estimated_value is null or estimated_value >= 0),
  converted_client_id uuid references clients(id) on delete set null,
  converted_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  type text not null check (type in ('note', 'status_change', 'follow_up_set', 'converted', 'archived', 'restored')),
  body text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists leads_company_id_idx on leads(company_id);
create index if not exists leads_status_idx on leads(company_id, status);
create index if not exists leads_follow_up_at_idx on leads(company_id, follow_up_at);
create index if not exists lead_activities_lead_id_idx on lead_activities(lead_id);

alter table leads enable row level security;
alter table lead_activities enable row level security;

drop policy if exists leads_staff_all on leads;
create policy leads_staff_all on leads
  for all using (
    auth_is_company_staff()
    and leads.company_id = auth_profile_company_id()
  );

drop policy if exists lead_activities_staff_all on lead_activities;
create policy lead_activities_staff_all on lead_activities
  for all using (
    auth_is_company_staff()
    and lead_activities.company_id = auth_profile_company_id()
  );