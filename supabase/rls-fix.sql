-- Run in Supabase SQL editor AFTER portal-schema.sql
-- Fixes recursive RLS on profiles and adds companies access for staff.

-- Security definer helpers (bypass RLS for policy checks)
create or replace function public.auth_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_profile_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_profile_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_is_company_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_profile_role() in ('company_admin', 'team_member'), false);
$$;

create or replace function public.auth_is_client_portal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_profile_role() = 'client', false);
$$;

grant execute on function public.auth_profile_role() to authenticated;
grant execute on function public.auth_profile_company_id() to authenticated;
grant execute on function public.auth_profile_client_id() to authenticated;
grant execute on function public.auth_is_company_staff() to authenticated;
grant execute on function public.auth_is_client_portal() to authenticated;

-- Profiles (fix recursive staff policy)
drop policy if exists profiles_select_company_staff on profiles;
create policy profiles_select_company_staff on profiles
  for select using (
    auth_is_company_staff()
    and profiles.company_id = auth_profile_company_id()
    and profiles.company_id is not null
  );

-- Companies: staff access their own company
alter table companies enable row level security;

drop policy if exists companies_staff_select on companies;
create policy companies_staff_select on companies
  for select using (
    auth_is_company_staff()
    and companies.id = auth_profile_company_id()
  );

drop policy if exists companies_staff_update on companies;
create policy companies_staff_update on companies
  for update using (
    auth_profile_role() = 'company_admin'
    and companies.id = auth_profile_company_id()
  );

-- Staff policies using helpers (avoid nested profiles RLS issues)
drop policy if exists clients_staff_all on clients;
create policy clients_staff_all on clients
  for all using (
    auth_is_company_staff()
    and clients.company_id = auth_profile_company_id()
  );

drop policy if exists clients_portal_select on clients;
create policy clients_portal_select on clients
  for select using (
    auth_is_client_portal()
    and clients.id = auth_profile_client_id()
    and clients.portal_enabled = true
  );

drop policy if exists schedules_staff_all on schedules;
create policy schedules_staff_all on schedules
  for all using (
    exists (
      select 1 from clients c
      where c.id = schedules.client_id
        and auth_is_company_staff()
        and c.company_id = auth_profile_company_id()
    )
  );

drop policy if exists schedules_client_select on schedules;
create policy schedules_client_select on schedules
  for select using (
    auth_is_client_portal()
    and schedules.client_id = auth_profile_client_id()
    and exists (
      select 1 from clients c
      where c.id = auth_profile_client_id()
        and c.portal_enabled = true
    )
  );

drop policy if exists estimates_staff_all on estimates;
create policy estimates_staff_all on estimates
  for all using (
    auth_is_company_staff()
    and estimates.company_id = auth_profile_company_id()
  );

drop policy if exists estimates_client_select on estimates;
create policy estimates_client_select on estimates
  for select using (
    auth_is_client_portal()
    and estimates.client_id = auth_profile_client_id()
    and exists (
      select 1 from clients c
      where c.id = auth_profile_client_id()
        and c.portal_enabled = true
    )
  );

drop policy if exists client_documents_staff_all on client_documents;
create policy client_documents_staff_all on client_documents
  for all using (
    auth_is_company_staff()
    and client_documents.company_id = auth_profile_company_id()
  );

drop policy if exists client_documents_client_select on client_documents;
create policy client_documents_client_select on client_documents
  for select using (
    auth_is_client_portal()
    and client_documents.client_id = auth_profile_client_id()
    and exists (
      select 1 from clients c
      where c.id = auth_profile_client_id()
        and c.portal_enabled = true
    )
  );

drop policy if exists billing_line_items_staff_all on billing_line_items;
create policy billing_line_items_staff_all on billing_line_items
  for all using (
    auth_is_company_staff()
    and billing_line_items.company_id = auth_profile_company_id()
  );

drop policy if exists billing_line_items_client_select on billing_line_items;
create policy billing_line_items_client_select on billing_line_items
  for select using (
    auth_is_client_portal()
    and billing_line_items.client_id = auth_profile_client_id()
    and exists (
      select 1 from clients c
      where c.id = auth_profile_client_id()
        and c.portal_enabled = true
    )
  );

drop policy if exists billing_payments_staff_all on billing_payments;
create policy billing_payments_staff_all on billing_payments
  for all using (
    auth_is_company_staff()
    and billing_payments.company_id = auth_profile_company_id()
  );

drop policy if exists billing_payments_client_select on billing_payments;
create policy billing_payments_client_select on billing_payments
  for select using (
    auth_is_client_portal()
    and billing_payments.client_id = auth_profile_client_id()
    and exists (
      select 1 from clients c
      where c.id = auth_profile_client_id()
        and c.portal_enabled = true
    )
  );