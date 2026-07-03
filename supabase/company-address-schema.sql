-- Structured company address fields (run in Supabase SQL editor)

alter table companies add column if not exists address_street text;
alter table companies add column if not exists address_unit text;
alter table companies add column if not exists address_city text;
alter table companies add column if not exists address_state text;
alter table companies add column if not exists address_zip text;