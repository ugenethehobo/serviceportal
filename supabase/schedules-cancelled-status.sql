-- Run in the Supabase SQL editor (or via migration) to allow job cancellation.
-- Fixes: schedules_status_check rejects status = 'cancelled'

alter table schedules drop constraint if exists schedules_status_check;

alter table schedules add constraint schedules_status_check
  check (status in ('scheduled', 'in_progress', 'archived', 'cancelled'));