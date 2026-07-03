-- Run in Supabase SQL editor — client portal identity, profile link, and RLS baseline.

-- Client portal fields
alter table clients add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table clients add column if not exists portal_enabled boolean not null default false;
alter table clients add column if not exists portal_invited_at timestamptz;
alter table clients add column if not exists portal_last_login_at timestamptz;

create unique index if not exists clients_auth_user_id_idx on clients(auth_user_id)
  where auth_user_id is not null;

-- Client role on profiles
alter table profiles add column if not exists client_id uuid references clients(id) on delete set null;

create unique index if not exists profiles_client_id_idx on profiles(client_id)
  where client_id is not null;

-- Enable RLS on core tables (service role bypasses RLS)
alter table clients enable row level security;
alter table schedules enable row level security;
alter table estimates enable row level security;
alter table client_documents enable row level security;
alter table billing_line_items enable row level security;
alter table billing_payments enable row level security;
alter table profiles enable row level security;

-- Profiles: users read their own row
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select using (auth.uid() = id);

-- Staff read company profiles
drop policy if exists profiles_select_company_staff on profiles;
create policy profiles_select_company_staff on profiles
  for select using (
    exists (
      select 1 from profiles staff
      where staff.id = auth.uid()
        and staff.role in ('company_admin', 'team_member')
        and staff.company_id = profiles.company_id
    )
  );

-- Clients: staff read/write their company's clients
drop policy if exists clients_staff_all on clients;
create policy clients_staff_all on clients
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('company_admin', 'team_member')
        and p.company_id = clients.company_id
    )
  );

-- Clients: portal users read their own client record
drop policy if exists clients_portal_select on clients;
create policy clients_portal_select on clients
  for select using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'client'
        and p.client_id = clients.id
        and clients.portal_enabled = true
    )
  );

-- Schedules: staff company access
drop policy if exists schedules_staff_all on schedules;
create policy schedules_staff_all on schedules
  for all using (
    exists (
      select 1 from clients c
      join profiles p on p.company_id = c.company_id
      where c.id = schedules.client_id
        and p.id = auth.uid()
        and p.role in ('company_admin', 'team_member')
    )
  );

-- Schedules: client read own jobs
drop policy if exists schedules_client_select on schedules;
create policy schedules_client_select on schedules
  for select using (
    exists (
      select 1 from profiles p
      join clients c on c.id = p.client_id
      where p.id = auth.uid()
        and p.role = 'client'
        and schedules.client_id = p.client_id
        and c.portal_enabled = true
    )
  );

-- Estimates: staff
drop policy if exists estimates_staff_all on estimates;
create policy estimates_staff_all on estimates
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('company_admin', 'team_member')
        and p.company_id = estimates.company_id
    )
  );

-- Estimates: client read (+ update status via server actions)
drop policy if exists estimates_client_select on estimates;
create policy estimates_client_select on estimates
  for select using (
    exists (
      select 1 from profiles p
      join clients c on c.id = p.client_id
      where p.id = auth.uid()
        and p.role = 'client'
        and estimates.client_id = p.client_id
        and c.portal_enabled = true
    )
  );

-- Documents: staff
drop policy if exists client_documents_staff_all on client_documents;
create policy client_documents_staff_all on client_documents
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('company_admin', 'team_member')
        and p.company_id = client_documents.company_id
    )
  );

-- Documents: client read
drop policy if exists client_documents_client_select on client_documents;
create policy client_documents_client_select on client_documents
  for select using (
    exists (
      select 1 from profiles p
      join clients c on c.id = p.client_id
      where p.id = auth.uid()
        and p.role = 'client'
        and client_documents.client_id = p.client_id
        and c.portal_enabled = true
    )
  );

-- Billing line items: staff
drop policy if exists billing_line_items_staff_all on billing_line_items;
create policy billing_line_items_staff_all on billing_line_items
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('company_admin', 'team_member')
        and p.company_id = billing_line_items.company_id
    )
  );

-- Billing line items: client read
drop policy if exists billing_line_items_client_select on billing_line_items;
create policy billing_line_items_client_select on billing_line_items
  for select using (
    exists (
      select 1 from profiles p
      join clients c on c.id = p.client_id
      where p.id = auth.uid()
        and p.role = 'client'
        and billing_line_items.client_id = p.client_id
        and c.portal_enabled = true
    )
  );

-- Billing payments: staff
drop policy if exists billing_payments_staff_all on billing_payments;
create policy billing_payments_staff_all on billing_payments
  for all using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role in ('company_admin', 'team_member')
        and p.company_id = billing_payments.company_id
    )
  );

-- Billing payments: client read
drop policy if exists billing_payments_client_select on billing_payments;
create policy billing_payments_client_select on billing_payments
  for select using (
    exists (
      select 1 from profiles p
      join clients c on c.id = p.client_id
      where p.id = auth.uid()
        and p.role = 'client'
        and billing_payments.client_id = p.client_id
        and c.portal_enabled = true
    )
  );