-- Company logos storage bucket (run in Supabase SQL editor)

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', false)
on conflict (id) do nothing;

-- Service role uploads via server actions.
-- Initial policy allows any authenticated user to read logos; production-rls-hardening.sql
-- replaces this with a company-scoped read policy.
create policy "Company logos are readable by authenticated users"
on storage.objects for select
to authenticated
using (bucket_id = 'company-logos');