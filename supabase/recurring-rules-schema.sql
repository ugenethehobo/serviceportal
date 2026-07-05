-- Recurring job rules for schedules.recurring_rule_id.
-- Run AFTER schema-baseline.sql (requires schedules table).
-- Safe to re-run.

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  frequency text not null,
  interval integer not null default 1 check (interval > 0),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recurring_rules_frequency_check'
  ) then
    alter table public.recurring_rules
      add constraint recurring_rules_frequency_check
      check (frequency in ('daily', 'weekly', 'monthly'));
  end if;
end $$;

-- Link schedules to recurring rules
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'schedules_recurring_rule_id_fkey'
  ) then
    alter table public.schedules
      add constraint schedules_recurring_rule_id_fkey
      foreign key (recurring_rule_id) references public.recurring_rules(id) on delete set null;
  end if;
end $$;