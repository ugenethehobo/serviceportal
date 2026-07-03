-- Photo categories for job site images.
-- Run after job-photos-schema.sql.

alter table job_photos
  add column if not exists category text;

create index if not exists job_photos_category_idx on job_photos(category);

alter table companies
  add column if not exists job_photo_categories jsonb
  not null default '["Before","After","Damage","Equipment","Other"]'::jsonb;