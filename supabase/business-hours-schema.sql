-- Business hours for dashboard timeline (run in Supabase SQL editor)

alter table companies add column if not exists business_hours_start text not null default '08:00';
alter table companies add column if not exists business_hours_end text not null default '17:00';