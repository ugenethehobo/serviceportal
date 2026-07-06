-- Portal read access for job site photos (run after job-photos-schema.sql).

drop policy if exists job_photos_client_select on job_photos;
create policy job_photos_client_select on job_photos
  for select using (
    exists (
      select 1 from profiles p
      join clients c on c.id = p.client_id
      where p.id = auth.uid()
        and p.role = 'client'
        and job_photos.client_id = p.client_id
        and c.portal_enabled = true
    )
  );