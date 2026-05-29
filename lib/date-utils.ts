/**
 * TZ-aware date utilities for ServicePortal scheduling.
 * All storage is UTC (timestamptz). Inputs and displays use company default_timezone.
 * No external date libs beyond Intl (already available).
 */

export const DEFAULT_TIMEZONE = 'America/Chicago';

/**
 * Returns the IANA timezone string to use (falls back to Central).
 */
export function getDefaultTimezone(tz?: string | null): string {
  return tz || DEFAULT_TIMEZONE;
}

/**
 * Format a date for display in the given company timezone.
 */
export function formatInTimezone(
  dateInput: Date | string | null | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(date);
}

/**
 * Format a job's scheduled time range nicely.
 * Example: "Mar 5, 2026 9:00 AM – 10:30 AM"
 */
export function formatJobSchedule(
  job: { scheduled_start?: string | null; scheduled_end?: string | null; scheduled_date?: string | null },
  timeZone: string
): string {
  const startStr = job.scheduled_start || job.scheduled_date;
  if (!startStr) return 'Not scheduled';

  const start = new Date(startStr);
  if (isNaN(start.getTime())) return 'Invalid date';

  const datePart = formatInTimezone(start, timeZone, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

  const startTime = formatInTimezone(start, timeZone, timeOpts);

  const endStr = job.scheduled_end;
  if (endStr) {
    const end = new Date(endStr);
    if (!isNaN(end.getTime())) {
      const endTime = formatInTimezone(end, timeZone, timeOpts);
      return `${datePart} ${startTime} – ${endTime}`;
    }
  }

  return `${datePart} ${startTime}`;
}

/**
 * Convert a stored date (UTC) to a value suitable for <input type="datetime-local"> (wall time in company TZ).
 * Returns '' if no date.
 */
export function toDateTimeLocalValue(
  dateInput: Date | string | null | undefined,
  timeZone: string
): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  // Use parts to avoid string parsing issues
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // en-CA gives "2026-03-05, 09:30" or similar; normalize
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const y = map.year || '0000';
  const m = map.month || '01';
  const d = map.day || '01';
  const h = map.hour || '00';
  const min = map.minute || '00';

  return `${y}-${m}-${d}T${h}:${min}`;
}

/**
 * Parse a datetime-local input value (wall time the user typed, interpreted as company TZ)
 * and return a proper UTC ISO string for storage in timestamptz columns.
 *
 * Uses a proven offset-calculation trick that works for nearly all real-world dates
 * (including US/EU DST). Small edge error only possible exactly at DST transition instants.
 */
export function parseDateTimeLocalInTz(localValue: string, timeZone: string): string {
  if (!localValue) {
    return new Date().toISOString();
  }

  // localValue e.g. "2026-03-05T09:30"
  const [datePart, timePart] = localValue.split('T');
  if (!datePart || !timePart) {
    return new Date().toISOString();
  }

  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);

  if (!year || !month || !day || isNaN(hour) || isNaN(minute)) {
    return new Date().toISOString();
  }

  // 1. Treat the wall-clock numbers as a UTC instant temporarily
  const provisionalUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  // 2. Compute what the offset (minutes) of the target TZ is at/near that instant
  const offsetMinutes = getTzOffsetMinutes(provisionalUTC, timeZone);

  // 3. The true UTC instant that corresponds to "that wall time in that TZ" is
  //    provisional minus the offset (because the provisional was shifted forward by the TZ's positive offset)
  const trueUTC = new Date(provisionalUTC.getTime() - offsetMinutes * 60_000);

  return trueUTC.toISOString();
}

/**
 * Internal: compute TZ offset in minutes for a given instant using Intl.
 * Positive = TZ is ahead of UTC (e.g. +60 for CET in winter).
 */
function getTzOffsetMinutes(instant: Date, timeZone: string): number {
  // Format the same instant in UTC and in target TZ, then diff the epoch ms
  const utcStr = instant.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = instant.toLocaleString('en-US', { timeZone });

  const utcMs = new Date(utcStr).getTime();
  const tzMs = new Date(tzStr).getTime();

  // tzMs - utcMs = offset in ms for that TZ (e.g.  -21600000 for CST)
  return Math.round((tzMs - utcMs) / 60000);
}

/**
 * Is the given date "today" according to the company timezone's calendar day?
 */
export function isTodayInTimezone(dateInput: Date | string | null | undefined, timeZone: string): boolean {
  if (!dateInput) return false;
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return false;

  const now = new Date();
  const todayInTz = formatInTimezone(now, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateInTz = formatInTimezone(date, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return todayInTz === dateInTz;
}

/**
 * Return a Date representing the start of "today" in the company TZ (useful for query bounds).
 * Note: the returned Date is still a JS instant; use .toISOString() for Supabase filters.
 */
export function getStartOfTodayInTz(timeZone: string): Date {
  // Get current wall date in TZ
  const now = new Date();
  const ymd = formatInTimezone(now, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = ymd.split('-').map(Number);

  // Construct midnight in that TZ as a UTC instant
  const midnightLocal = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00`;
  const iso = parseDateTimeLocalInTz(midnightLocal, timeZone);
  return new Date(iso);
}

/**
 * Helper to safely get a Date from job fields (prefers new scheduled_start).
 */
export function getJobStartDate(job: any): Date | null {
  const s = job?.scheduled_start || job?.scheduled_date;
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function getJobEndDate(job: any): Date | null {
  if (!job?.scheduled_end) return null;
  const d = new Date(job.scheduled_end);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Expand a recurring master job into virtual instances that fall within [rangeStart, rangeEnd].
 * Each instance gets a synthetic _instanceKey for React keys and a scheduled_start / scheduled_date for compatibility.
 * Does NOT mutate the original job.
 *
 * If the job is not recurring, returns [job] (wrapped for uniformity).
 */
export function expandRecurringJob(
  job: any,
  rangeStart: Date,
  rangeEnd: Date
): any[] {
  if (!job?.is_recurring || !job?.recurrence_frequency) {
    return [{ ...job, _instanceKey: `master-${job?.id || 'x'}` }];
  }

  const instances: any[] = [];
  const anchorStr = job.scheduled_start || job.scheduled_date;
  let current = anchorStr ? new Date(anchorStr) : new Date(rangeStart);

  // Go backwards from anchor to cover the range (for past months in calendar)
  const maxBack = 60; // safety
  let stepsBack = 0;
  while (current > rangeStart && stepsBack < maxBack) {
    const prev = new Date(current);
    switch (job.recurrence_frequency) {
      case 'weekly': prev.setDate(prev.getDate() - 7); break;
      case 'biweekly': prev.setDate(prev.getDate() - 14); break;
      case 'monthly': prev.setMonth(prev.getMonth() - 1); break;
      case 'quarterly': prev.setMonth(prev.getMonth() - 3); break;
      case 'yearly': prev.setFullYear(prev.getFullYear() - 1); break;
      default: break;
    }
    if (prev < rangeStart) break;
    current = prev;
    stepsBack++;
  }

  const maxForward = 120;
  let count = 0;
  while (current <= rangeEnd && count < maxForward) {
    const instStart = new Date(current);
    const instEnd = job.scheduled_end
      ? new Date(new Date(job.scheduled_end).getTime() + (instStart.getTime() - new Date(anchorStr || job.scheduled_date).getTime()))
      : null;

    // Only include if overlaps the range
    if (instStart >= rangeStart && instStart <= rangeEnd) {
      instances.push({
        ...job,
        // Virtual instance data
        scheduled_start: instStart.toISOString(),
        scheduled_date: instStart.toISOString(),
        scheduled_end: instEnd ? instEnd.toISOString() : job.scheduled_end,
        _instanceKey: `${job.id}-inst-${instStart.toISOString().slice(0,10)}-${count}`,
        is_recurring_instance: true,
      });
    }

    // Advance
    let next = new Date(current);
    switch (job.recurrence_frequency) {
      case 'weekly': next.setDate(next.getDate() + 7); break;
      case 'biweekly': next.setDate(next.getDate() + 14); break;
      case 'monthly': next.setMonth(next.getMonth() + 1); break;
      case 'quarterly': next.setMonth(next.getMonth() + 3); break;
      case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
      default: return instances;
    }

    if (job.recurrence_end_date && next > new Date(job.recurrence_end_date)) break;

    current = next;
    count++;
  }

  return instances;
}

/**
 * Professional scheduling helpers — overlap detection & availability support.
 */

export const DEFAULT_JOB_DURATION_MINUTES = 60;

/**
 * Returns a consistent [start, end] window for a job row.
 * Prefers the new scheduled_start / scheduled_end columns.
 * Falls back to scheduled_date (as start) + default duration if end is missing.
 */
export function getJobTimeWindow(job: any): { start: Date | null; end: Date | null } {
  const startStr = job?.scheduled_start || job?.scheduled_date || null;
  const endStr = job?.scheduled_end || null;

  if (!startStr) return { start: null, end: null };

  const start = new Date(startStr);
  if (isNaN(start.getTime())) return { start: null, end: null };

  let end: Date | null = null;
  if (endStr) {
    end = new Date(endStr);
    if (isNaN(end.getTime())) end = null;
  }
  if (!end) {
    end = new Date(start.getTime() + DEFAULT_JOB_DURATION_MINUTES * 60_000);
  }
  return { start, end };
}

/**
 * Visual timeline helpers for professional daily availability views.
 * Typical service business day window: 7:00–19:00 (12 hours shown).
 */
export const TIMELINE_START_HOUR = 7;
export const TIMELINE_END_HOUR = 19;
export const TIMELINE_TOTAL_MINUTES = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;

/**
 * Converts a Date to percentage (0-100) position on the visual daily timeline.
 * When `clampToNow` is provided (for "today" in company TZ), positions before "now"
 * will be treated as 0% so the visual doesn't show past availability.
 */
export function getTimelinePercent(date: Date | null, tz?: string, clampToNow?: Date | null): number {
  if (!date) return 0;
  let effectiveDate = date;

  if (clampToNow && date < clampToNow) {
    effectiveDate = clampToNow;
  }

  const h = effectiveDate.getHours();
  const m = effectiveDate.getMinutes();
  const minutesFromMidnight = h * 60 + m;
  const minutesFromStart = Math.max(0, minutesFromMidnight - TIMELINE_START_HOUR * 60);
  const clamped = Math.min(minutesFromStart, TIMELINE_TOTAL_MINUTES);
  return (clamped / TIMELINE_TOTAL_MINUTES) * 100;
}

/**
 * Returns the current wall-clock time in the given company timezone as a Date object
 * (for comparison purposes). Useful for "is this day today?" + clamping logic.
 */
export function getNowInTimezone(tz: string): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });

  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;

  return new Date(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
}

/**
 * Finds a good "next available" slot on the given day after considering existing bookings.
 * When `minStart` is provided (the "now" time in company TZ for "today"), it will never
 * suggest a time before that moment. This prevents past suggestions when scheduling for today.
 */
export function findNextAvailableSlot(
  dayBookings: any[],
  tz: string,
  durationMinutes = DEFAULT_JOB_DURATION_MINUTES,
  businessStartHour = TIMELINE_START_HOUR,
  businessEndHour = TIMELINE_END_HOUR,
  minStart?: Date | null   // pass current time in company TZ when the day is "today"
): { startLocal: string; endLocal: string } | null {

  // Determine the earliest we are allowed to schedule
  let earliestAllowed: Date;
  if (minStart) {
    earliestAllowed = new Date(Math.max(
      minStart.getTime(),
      new Date(minStart.getFullYear(), minStart.getMonth(), minStart.getDate(), businessStartHour, 0).getTime()
    ));
  } else {
    earliestAllowed = new Date();
    earliestAllowed.setHours(businessStartHour, 0, 0, 0);
  }

  // Build sorted list of busy windows (normalized)
  const busy: { start: Date; end: Date }[] = [];
  for (const j of dayBookings) {
    const w = getJobTimeWindow(j);
    if (w.start && w.end) busy.push({ start: w.start, end: w.end });
  }
  busy.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Start searching from the earliest allowed time
  let candidateStart = new Date(earliestAllowed);

  for (const b of busy) {
    const gapStart = candidateStart;
    const gapEnd = b.start;

    const gapMinutes = (gapEnd.getTime() - gapStart.getTime()) / 60000;
    if (gapMinutes >= durationMinutes) {
      const end = new Date(gapStart.getTime() + durationMinutes * 60_000);
      return {
        startLocal: toDateTimeLocalValue(gapStart, tz),
        endLocal: toDateTimeLocalValue(end, tz),
      };
    }
    // Move candidate past this booking (but never before earliestAllowed)
    candidateStart = b.end > candidateStart ? b.end : candidateStart;
  }

  // After last booking (or from earliestAllowed)
  const lastEnd = busy.length ? busy[busy.length - 1].end : candidateStart;
  let afterLast = lastEnd > candidateStart ? lastEnd : candidateStart;

  // Make sure we are still inside business hours
  if (afterLast.getHours() < businessStartHour) {
    afterLast = new Date(afterLast.getFullYear(), afterLast.getMonth(), afterLast.getDate(), businessStartHour, 0);
  }

  const afterMinutes = (afterLast.getHours() * 60 + afterLast.getMinutes()) - businessStartHour * 60;
  if (afterMinutes + durationMinutes <= TIMELINE_TOTAL_MINUTES) {
    const end = new Date(afterLast.getTime() + durationMinutes * 60_000);
    if (end.getHours() <= businessEndHour) {
      return {
        startLocal: toDateTimeLocalValue(afterLast, tz),
        endLocal: toDateTimeLocalValue(end, tz),
      };
    }
  }

  return null; // No good future slot found in visible window
}

/**
 * Core overlap check between two time windows.
 * Treats null end as "default duration after start".
 * Returns true if the two intervals have any intersection.
 */
export function doTimeWindowsOverlap(
  aStart: Date | string | null,
  aEnd: Date | string | null,
  bStart: Date | string | null,
  bEnd: Date | string | null,
  defaultDurationMinutes = DEFAULT_JOB_DURATION_MINUTES
): boolean {
  const A = normalizeWindow(aStart, aEnd, defaultDurationMinutes);
  const B = normalizeWindow(bStart, bEnd, defaultDurationMinutes);
  if (!A.start || !B.start || !A.end || !B.end) return false;

  // Classic interval overlap: max(start) < min(end)
  const latestStart = A.start > B.start ? A.start : B.start;
  const earliestEnd = A.end < B.end ? A.end : B.end;
  return latestStart < earliestEnd;
}

function normalizeWindow(
  start: Date | string | null,
  end: Date | string | null,
  defaultDurMin: number
): { start: Date | null; end: Date | null } {
  if (!start) return { start: null, end: null };
  const s = typeof start === 'string' ? new Date(start) : start;
  if (isNaN(s.getTime())) return { start: null, end: null };

  let e: Date | null = null;
  if (end) {
    e = typeof end === 'string' ? new Date(end) : end;
    if (isNaN(e.getTime())) e = null;
  }
  if (!e) {
    e = new Date(s.getTime() + defaultDurMin * 60_000);
  }
  return { start: s, end: e };
}

/**
 * Lightweight time-only formatter for availability lists (e.g. "9:00 AM").
 */
export function formatTimeOnlyInTz(
  dateInput: Date | string | null | undefined,
  timeZone: string
): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Extract just the date portion (YYYY-MM-DD) from a datetime-local input value
 * or an ISO string, as it appears in the company timezone.
 * Useful for deciding when to re-fetch "availability for this day".
 */
export function getLocalDateKeyFromInput(value: string, timeZone: string): string | null {
  if (!value) return null;
  // value is "2026-03-05T09:30" — the date part is already the wall date the user selected
  // (because datetime-local shows local wall time). We just take the left side.
  const datePart = value.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  return null;
}
