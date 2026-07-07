-- Production RLS hardening (run AFTER rls-fix.sql and feature migrations).
-- Closes cross-tenant gaps on tables queried from the browser and tightens storage policies.

-- ---------------------------------------------------------------------------
-- crews
-- ---------------------------------------------------------------------------
alter table public.crews enable row level security;

drop policy if exists crews_staff_all on public.crews;
create policy crews_staff_all on public.crews
  for all
  using (
    auth_is_company_staff()
    and crews.company_id = auth_profile_company_id()
  )
  with check (
    auth_is_company_staff()
    and crews.company_id = auth_profile_company_id()
  );

-- ---------------------------------------------------------------------------
-- bookable_services
-- ---------------------------------------------------------------------------
alter table public.bookable_services enable row level security;

drop policy if exists bookable_services_staff_all on public.bookable_services;
create policy bookable_services_staff_all on public.bookable_services
  for all
  using (
    auth_is_company_staff()
    and bookable_services.company_id = auth_profile_company_id()
  )
  with check (
    auth_is_company_staff()
    and bookable_services.company_id = auth_profile_company_id()
  );

-- ---------------------------------------------------------------------------
-- estimate_line_items (scoped via parent estimate)
-- ---------------------------------------------------------------------------
alter table public.estimate_line_items enable row level security;

drop policy if exists estimate_line_items_staff_all on public.estimate_line_items;
create policy estimate_line_items_staff_all on public.estimate_line_items
  for all
  using (
    auth_is_company_staff()
    and exists (
      select 1
      from public.estimates e
      where e.id = estimate_line_items.estimate_id
        and e.company_id = auth_profile_company_id()
    )
  )
  with check (
    auth_is_company_staff()
    and exists (
      select 1
      from public.estimates e
      where e.id = estimate_line_items.estimate_id
        and e.company_id = auth_profile_company_id()
    )
  );

drop policy if exists estimate_line_items_client_select on public.estimate_line_items;
create policy estimate_line_items_client_select on public.estimate_line_items
  for select
  using (
    auth_is_client_portal()
    and exists (
      select 1
      from public.estimates e
      join public.clients c on c.id = e.client_id
      where e.id = estimate_line_items.estimate_id
        and e.client_id = auth_profile_client_id()
        and c.portal_enabled = true
    )
  );

-- ---------------------------------------------------------------------------
-- recurring_rules (scoped via linked schedules; mutations use service role)
-- ---------------------------------------------------------------------------
alter table public.recurring_rules enable row level security;

drop policy if exists recurring_rules_staff_all on public.recurring_rules;
create policy recurring_rules_staff_all on public.recurring_rules
  for all
  using (
    auth_is_company_staff()
    and exists (
      select 1
      from public.schedules s
      join public.clients c on c.id = s.client_id
      where s.recurring_rule_id = recurring_rules.id
        and c.company_id = auth_profile_company_id()
    )
  )
  with check (
    auth_is_company_staff()
    and exists (
      select 1
      from public.schedules s
      join public.clients c on c.id = s.client_id
      where s.recurring_rule_id = recurring_rules.id
        and c.company_id = auth_profile_company_id()
    )
  );

-- ---------------------------------------------------------------------------
-- notification_log (staff read-only; writes via service role / cron)
-- ---------------------------------------------------------------------------
alter table public.notification_log enable row level security;

drop policy if exists notification_log_staff_select on public.notification_log;
create policy notification_log_staff_select on public.notification_log
  for select
  using (
    auth_is_company_staff()
    and notification_log.company_id = auth_profile_company_id()
  );

-- ---------------------------------------------------------------------------
-- platform_signup_checkouts (service role only — no authenticated policies)
-- ---------------------------------------------------------------------------
alter table public.platform_signup_checkouts enable row level security;

-- ---------------------------------------------------------------------------
-- Storage: company-scoped reads (uploads continue via service role)
-- ---------------------------------------------------------------------------

drop policy if exists "Company logos are readable by authenticated users" on storage.objects;

create policy "Company logos readable by company staff"
on storage.objects for select
to authenticated
using (
  bucket_id = 'company-logos'
  and auth_is_company_staff()
  and split_part(name, '/', 1) = auth_profile_company_id()::text
);

create policy "Company backgrounds readable by company staff"
on storage.objects for select
to authenticated
using (
  bucket_id = 'user-backgrounds'
  and auth_is_company_staff()
  and split_part(name, '/', 1) = auth_profile_company_id()::text
);

create policy "Client documents readable by company staff"
on storage.objects for select
to authenticated
using (
  bucket_id = 'client-documents'
  and auth_is_company_staff()
  and split_part(name, '/', 1) = auth_profile_company_id()::text
);

create policy "Job photos readable by company staff"
on storage.objects for select
to authenticated
using (
  bucket_id = 'job-photos'
  and auth_is_company_staff()
  and split_part(name, '/', 1) = auth_profile_company_id()::text
);

create policy "User avatars readable by owner"
on storage.objects for select
to authenticated
using (
  bucket_id = 'user-avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);