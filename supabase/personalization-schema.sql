-- Company-wide appearance personalization (accent, surfaces, background).
-- Applies to all staff and client portal users for the company.

alter table companies
  add column if not exists accent_color text,
  add column if not exists background_image_url text,
  add column if not exists background_color text,
  add column if not exists card_color text,
  add column if not exists text_color text;

comment on column companies.accent_color is
  'Optional hex accent (e.g. #2563eb). Shared by all company users.';
comment on column companies.background_image_url is
  'Storage path for the company full-app background image.';
comment on column companies.background_color is
  'Optional solid page background hex. Prefer image when both are set.';
comment on column companies.card_color is
  'Optional card/popover/sidebar surface hex.';
comment on column companies.text_color is
  'Optional primary text/foreground hex.';

-- Optional one-time migration if upgrading from per-profile personalization:
-- update companies c
-- set
--   accent_color = coalesce(c.accent_color, p.accent_color),
--   background_image_url = coalesce(c.background_image_url, p.background_image_url)
-- from profiles p
-- where p.company_id = c.id
--   and p.role = 'company_admin'
--   and (p.accent_color is not null or p.background_image_url is not null);