-- Per-login portal access time limits.
-- NULL portal_access_expires_at means the login never expires.

alter table public.profiles
  add column if not exists portal_access_expires_at timestamptz null;

comment on column public.profiles.portal_access_expires_at is
  'When this client portal login loses access. NULL means no expiry (permanent access).';

create index if not exists profiles_portal_access_expires_at_idx
  on public.profiles (portal_access_expires_at)
  where portal_access_expires_at is not null and role = 'client';
