-- Allow multiple client-portal logins per client household.
-- Previously profiles.client_id was unique (one login per client).

drop index if exists public.profiles_client_id_idx;

create index if not exists profiles_client_id_lookup_idx
  on public.profiles (client_id)
  where client_id is not null;

comment on column public.profiles.client_id is
  'Client this portal user can access. Multiple profiles may share the same client_id.';
