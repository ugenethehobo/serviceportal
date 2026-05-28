# Job Scheduling Migration: Start + End Times + Timezone Fixes

## Problem Summary
- Reschedule popups and scheduling used `new Date(x).toISOString()` without respecting `company_settings.default_timezone`.
  This caused "wild" day/time shifts (UTC storage vs local interpretation).
- Jobs had only a single `scheduled_date` (treated as instant, no duration).
- Calendar only showed plain jobs; recurring job instances were never expanded into the view.

## Required Schema Change (RUN THIS FIRST IN SUPABASE SQL EDITOR)

```sql
-- 1. Add new columns (safe, idempotent)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS scheduled_start timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_end timestamptz;

-- 2. Backfill existing data (scheduled_date becomes the start time)
UPDATE public.jobs
SET scheduled_start = scheduled_date
WHERE scheduled_start IS NULL 
  AND scheduled_date IS NOT NULL;

-- 3. (Optional but recommended) If you want to eventually drop the old column after verification:
-- ALTER TABLE public.jobs DROP COLUMN IF EXISTS scheduled_date;

-- 4. Verify
SELECT id, title, scheduled_date, scheduled_start, scheduled_end, is_recurring 
FROM jobs 
LIMIT 5;
```

After running, all new scheduling will use `scheduled_start` / `scheduled_end`.

Existing `scheduled_date` remains for backward safety during transition; code will prefer the new columns.

## Design Decisions
- Use two explicit timestamptz columns (`scheduled_start`, `scheduled_end`) instead of start + duration. This allows precise end times (e.g., 9:00-11:30) and is what "start time AND end time" implies.
- All storage is UTC (timestamptz). Display and input always interpret wall-clock times in the company's `default_timezone`.
- Recurring jobs stay as masters in the `jobs` table (with `is_recurring`, `recurrence_frequency`, `recurrence_end_date`). Instances are generated on-the-fly for UI (calendar, timeline, dashboard). The master's `scheduled_start` acts as the "anchor" / next due start.
- Add job and reschedule UIs upgraded from single date or datetime-local to paired Start + End datetime-local inputs.
- Calendar will expand recurring masters into virtual instances for the visible date range (using a shared generator).
- New shared date utilities in `lib/date-utils.ts` for TZ-aware formatting/parsing to eliminate future drift.
- Fallback logic: if `scheduled_start` null, fall back to old `scheduled_date` (for transition period).
- Default duration when only start provided: 60 minutes (for end display / route planning).
- Drag & drop on calendar for recurring instances: will be disabled or will update the master's anchor (TBD in impl, prefer non-destructive).

## Files That Will Change (estimated)
- `app/dashboard/clients/[clientId]/page.tsx` — Add job form, reschedule modal, formatters, recurring generator, job detail displays. (Biggest)
- `app/dashboard/calendar/page.tsx` — Load recurrence fields, expand instances in getJobsForDay, update drag-drop to handle start, improve job type.
- `app/dashboard/page.tsx` — Update all today/upcoming filters, sorts, displays to use new fields + TZ helpers.
- `app/dashboard/route-planner/page.tsx` — Update job select + ordering to use scheduled_start.
- `app/dashboard/jobs/page.tsx` — (low priority, mostly unused) Update form for consistency.
- `app/portal/[token]/page.tsx` — Display updates (read-only).
- `app/dashboard/clients/page.tsx` — Minor select if needed.
- `lib/date-utils.ts` — NEW: TZ helpers (formatInCompanyTz, parseLocalDateTimeInTzToISO, getTodayInTz, etc.)
- Possibly `app/dashboard/settings/page.tsx` — Minor (ensure tz always selected).

## Post-Migration Code Behavior
- New jobs: both start and end required? (or end optional, defaults +1h)
- Reschedule: edits both start and end (end can be cleared to "no end").
- Displays: "Mar 5, 2026 9:00 AM – 10:30 AM (CT)" when tz and end present.
- Calendar recurring: future + in-view instances will appear as distinct cards (synthetic keys to avoid id collision).
- All "is today" logic will use company TZ for day boundary.

## Rollback
If issues: the columns are additive. Code will continue to read scheduled_date as fallback. Dropping the new columns restores old behavior (after code revert).

## Next Steps After SQL
Run `npm run build` (or dev) after the code updates land. Test with a job in a TZ far from UTC (e.g. set to Asia/Tokyo while browser is US).

## Notes for Implementation
- Prioritize fixing the client detail page (source of reschedule bug) first.
- Make a single `formatJobTime(job, tz)` helper used everywhere.
- For calendar drag-drop on a recurring instance: for v1, skip or only affect non-recurring; advanced "change this occurrence only" can be future.
- Ensure no `new Date(foo).toISOString()` for user-facing schedule values without going through the TZ layer.

Run the SQL above, then we can proceed with the code changes.
