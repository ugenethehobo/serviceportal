-- Photo categories for job site images.
-- Run after job-photos-schema.sql.
-- Categories are fully custom per company — no preset defaults.

alter table job_photos
  add column if not exists category text;

create index if not exists job_photos_category_idx on job_photos(category);

alter table companies
  add column if not exists job_photo_categories jsonb
  not null default '[]'::jsonb;

-- Remove legacy preset defaults if the column already existed.
update companies
set job_photo_categories = '[]'::jsonb
where job_photo_categories = '["Before","After","Damage","Equipment","Other"]'::jsonb;
