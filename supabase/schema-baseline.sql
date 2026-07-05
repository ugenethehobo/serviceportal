-- ServicePortal core schema baseline.
-- Run FIRST on a greenfield Supabase project, then apply incremental migrations
-- in the order documented in docs/DEPLOYMENT.md.
--
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS and conditional constraints.

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  logo_url text,
  status text not null default 'Active',
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now()
);

create index if not exists companies_created_at_idx
  on public.companies(created_at desc);

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users; created by server actions on signup)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  company_id uuid references public.companies(id) on delete set null,
  crew_id uuid,
  role text not null default 'team_member',
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create index if not exists profiles_company_id_idx on public.profiles(company_id);
create index if not exists profiles_crew_id_idx on public.profiles(crew_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('company_admin', 'team_member', 'client'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists clients_company_id_idx on public.clients(company_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_status_check'
  ) then
    alter table public.clients
      add constraint clients_status_check
      check (status in ('active', 'archived'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- crews
-- ---------------------------------------------------------------------------
create table if not exists public.crews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  crew_lead_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crews_company_id_idx on public.crews(company_id);

-- Deferred FK: profiles.crew_id -> crews
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_crew_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_crew_id_fkey
      foreign key (crew_id) references public.crews(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- schedules (jobs)
-- recurring_rule_id FK is added in recurring-rules-schema.sql
-- ---------------------------------------------------------------------------
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  crew_id uuid references public.crews(id) on delete set null,
  recurring_rule_id uuid,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'scheduled',
  price numeric not null default 0 check (price >= 0),
  created_at timestamptz not null default now()
);

create index if not exists schedules_client_id_idx on public.schedules(client_id);
create index if not exists schedules_crew_id_idx on public.schedules(crew_id);
create index if not exists schedules_start_time_idx on public.schedules(start_time);
create index if not exists schedules_recurring_rule_id_idx on public.schedules(recurring_rule_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'schedules_status_check'
  ) then
    alter table public.schedules
      add constraint schedules_status_check
      check (status in ('scheduled', 'in_progress', 'archived'));
  end if;
end $$;