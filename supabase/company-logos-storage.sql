-- Company logos storage bucket (run in Supabase SQL editor)

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', false)
on conflict (id) do nothing;

-- Service role uploads via server actions; authenticated company users can read their logos.
create policy "Company logos are readable by authenticated users"
on storage.objects for select
to authenticated
using (bucket_id = 'company-logos');