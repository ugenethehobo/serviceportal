-- Run in Supabase SQL editor — job site photos attached to schedules.
-- Also create a private Storage bucket named "job-photos" (public: off).

create table if not exists job_photos (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  file_size integer not null check (file_size > 0),
  caption text,
  category text,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists job_photos_schedule_id_idx on job_photos(schedule_id);
create index if not exists job_photos_company_id_idx on job_photos(company_id);

alter table job_photos enable row level security;

drop policy if exists job_photos_staff_all on job_photos;
create policy job_photos_staff_all on job_photos
  for all using (
    auth_is_company_staff()
    and job_photos.company_id = auth_profile_company_id()
  );