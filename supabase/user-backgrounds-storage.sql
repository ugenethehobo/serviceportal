-- Private bucket for company full-app background images (path: {companyId}/background/...).
-- Create in Supabase Dashboard → Storage if this script cannot create buckets in your project.

insert into storage.buckets (id, name, public)
values ('user-backgrounds', 'user-backgrounds', false)
on conflict (id) do nothing;