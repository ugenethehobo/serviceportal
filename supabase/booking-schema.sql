-- Public client booking: company mode, slug, and bookable services.
-- Run AFTER leads-schema.sql.

alter table public.companies
  add column if not exists booking_mode text not null default 'request_form';

alter table public.companies
  add column if not exists booking_slug text;

alter table public.companies
  add column if not exists booking_settings jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'companies_booking_mode_check'
  ) then
    alter table public.companies
      add constraint companies_booking_mode_check
      check (booking_mode in ('online_booking', 'request_form'));
  end if;
end $$;

create unique index if not exists companies_booking_slug_uidx
  on public.companies(booking_slug)
  where booking_slug is not null;

create table if not exists public.bookable_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null default 60 check (duration_minutes > 0 and duration_minutes <= 480),
  price_estimate numeric check (price_estimate is null or price_estimate >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookable_services_company_id_idx
  on public.bookable_services(company_id, active, sort_order);