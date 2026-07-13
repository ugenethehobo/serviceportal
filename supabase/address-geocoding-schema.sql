-- Persisted geocode coordinates for map and route planner (run in Supabase SQL editor)

alter table companies add column if not exists latitude double precision;
alter table companies add column if not exists longitude double precision;
alter table companies add column if not exists geocode_address_key text;

alter table clients add column if not exists latitude double precision;
alter table clients add column if not exists longitude double precision;
alter table clients add column if not exists geocode_address_key text;