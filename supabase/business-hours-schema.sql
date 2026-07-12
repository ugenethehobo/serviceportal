-- Business hours for dashboard timeline, scheduler, and booking (run in Supabase SQL editor)

alter table companies add column if not exists business_hours_start text not null default '08:00';
alter table companies add column if not exists business_hours_end text not null default '17:00';

-- 0=Sun … 6=Sat. Default Mon–Fri open; weekends closed.
alter table companies add column if not exists business_open_weekdays integer[] not null default '{1,2,3,4,5}';