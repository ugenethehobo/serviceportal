-- Platform-wide settings (admin-controlled release mode).
-- Run in Supabase SQL editor.

create table if not exists platform_settings (
  id text primary key default 'default',
  release_mode text not null default 'beta'
    check (release_mode in ('beta', 'release')),
  scheduled_release_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table platform_settings
  add column if not exists scheduled_release_at timestamptz;

insert into platform_settings (id, release_mode)
values ('default', 'beta')
on conflict (id) do nothing;

comment on table platform_settings is
  'Singleton platform config. beta = closed beta; release = public launch with free trial.';

create table if not exists beta_access_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  company_name text not null,
  phone text,
  team_size text,
  message text,
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'invited', 'declined')),
  metadata jsonb
);

create index if not exists beta_access_requests_created_at_idx
  on beta_access_requests (created_at desc);

comment on table beta_access_requests is
  'Inbound beta access requests from the marketing site.';