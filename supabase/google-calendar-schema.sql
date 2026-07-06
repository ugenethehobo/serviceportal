-- Google Calendar one-way job export (P1-E).
-- Run AFTER integrations-schema.sql.

alter table public.schedules
  add column if not exists google_calendar_event_id text;

create index if not exists schedules_google_calendar_event_id_idx
  on public.schedules(google_calendar_event_id)
  where google_calendar_event_id is not null;