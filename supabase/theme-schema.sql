-- Per-user theme preference (run in Supabase SQL editor)

alter table profiles add column if not exists theme_preference text not null default 'light';

alter table profiles drop constraint if exists profiles_theme_preference_check;
alter table profiles add constraint profiles_theme_preference_check
  check (theme_preference in ('light', 'dark'));

-- Users can update their own profile (theme, etc.)
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);