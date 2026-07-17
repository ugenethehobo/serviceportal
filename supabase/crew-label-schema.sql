-- Company-customizable label for field crews (default: "Crews").
-- Company admins set this in Settings → Company profile; used in nav, page titles, etc.
alter table public.companies
  add column if not exists crew_label text;

comment on column public.companies.crew_label is
  'Plural display name for crews (e.g. Crews, Teams, Units). Null/blank = Crews.';
