-- P4: Multi-tech helpers on jobs (schedules).
-- Run in Supabase SQL editor after schema-baseline.sql / rls-fix.sql.

create table if not exists public.schedule_helpers (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (schedule_id, profile_id)
);

create index if not exists schedule_helpers_schedule_id_idx
  on public.schedule_helpers(schedule_id);

create index if not exists schedule_helpers_profile_id_idx
  on public.schedule_helpers(profile_id);

alter table public.schedule_helpers enable row level security;

drop policy if exists schedule_helpers_staff_all on public.schedule_helpers;
create policy schedule_helpers_staff_all on public.schedule_helpers
  for all using (
    public.auth_is_company_staff()
    and exists (
      select 1
      from public.schedules s
      join public.clients c on c.id = s.client_id
      where s.id = schedule_helpers.schedule_id
        and c.company_id = public.auth_profile_company_id()
    )
  )
  with check (
    public.auth_is_company_staff()
    and exists (
      select 1
      from public.schedules s
      join public.clients c on c.id = s.client_id
      where s.id = schedule_helpers.schedule_id
        and c.company_id = public.auth_profile_company_id()
    )
  );
