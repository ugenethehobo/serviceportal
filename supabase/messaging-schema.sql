-- Run in Supabase SQL editor AFTER portal-schema.sql and rls-fix.sql
-- In-app messaging: client-level threads (schedule_id IS NULL) and job-level threads.

create table if not exists message_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  schedule_id uuid references schedules(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists message_threads_client_level_idx
  on message_threads (client_id)
  where schedule_id is null;

create unique index if not exists message_threads_job_level_idx
  on message_threads (schedule_id)
  where schedule_id is not null;

create index if not exists message_threads_company_id_idx on message_threads(company_id);
create index if not exists message_threads_client_id_idx on message_threads(client_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  sender_user_id uuid not null references profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('staff', 'client')),
  sender_name text,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_thread_id_created_at_idx
  on messages(thread_id, created_at asc);

create index if not exists messages_company_id_idx on messages(company_id);

alter table message_threads enable row level security;
alter table messages enable row level security;

drop policy if exists message_threads_staff_all on message_threads;
create policy message_threads_staff_all on message_threads
  for all using (
    auth_is_company_staff()
    and message_threads.company_id = auth_profile_company_id()
  );

drop policy if exists message_threads_portal_select on message_threads;
create policy message_threads_portal_select on message_threads
  for select using (
    auth_is_client_portal()
    and message_threads.client_id = auth_profile_client_id()
  );

drop policy if exists messages_staff_all on messages;
create policy messages_staff_all on messages
  for all using (
    auth_is_company_staff()
    and messages.company_id = auth_profile_company_id()
  );

drop policy if exists messages_portal_select on messages;
create policy messages_portal_select on messages
  for select using (
    auth_is_client_portal()
    and exists (
      select 1 from message_threads t
      where t.id = messages.thread_id
        and t.client_id = auth_profile_client_id()
    )
  );

drop policy if exists messages_portal_insert on messages;
create policy messages_portal_insert on messages
  for insert with check (
    auth_is_client_portal()
    and messages.sender_role = 'client'
    and messages.sender_user_id = auth.uid()
    and exists (
      select 1 from message_threads t
      where t.id = messages.thread_id
        and t.client_id = auth_profile_client_id()
    )
  );