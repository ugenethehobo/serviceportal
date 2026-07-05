-- Tracks which theoretical recurring occurrence a materialized override replaces.
-- Run AFTER recurring-rules-schema.sql.

alter table public.schedules
  add column if not exists occurrence_origin_start timestamptz;

create index if not exists schedules_occurrence_origin_start_idx
  on public.schedules(occurrence_origin_start)
  where occurrence_origin_start is not null;