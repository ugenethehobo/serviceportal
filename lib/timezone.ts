const WEEKDAY_SHORT_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** 0=Sun … 6=Sat for a YYYY-MM-DD date in the company timezone. */
export function getWeekdayInCompanyTimezone(dateStr: string, timezone: string): number {
  const anchor = new Date(parseAsCompanyTime(`${dateStr}T12:00`, timezone))
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(anchor)
  return WEEKDAY_SHORT_TO_INDEX[weekday] ?? 0
}

/** YYYY-MM-DD for a moment in the company timezone. */
export function getCompanyDateString(timezone: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function shiftCompanyDateString(
  dateStr: string,
  timezone: string,
  dayOffset: number
): string {
  if (dayOffset === 0) return dateStr

  const anchorIso = parseAsCompanyTime(`${dateStr}T12:00`, timezone)
  const shifted = new Date(anchorIso)
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset)
  return getCompanyDateString(timezone, shifted)
}

/** Start/end of a company-local calendar day as UTC ISO strings. */
export function getCompanyDayBounds(
  timezone: string,
  date: Date = new Date(),
  dayOffset = 0
) {
  const baseDateStr = getCompanyDateString(timezone, date)
  const dateStr = shiftCompanyDateString(baseDateStr, timezone, dayOffset)
  const nextDateStr = shiftCompanyDateString(dateStr, timezone, 1)

  return {
    startIso: parseAsCompanyTime(`${dateStr}T00:00`, timezone),
    endIso: parseAsCompanyTime(`${nextDateStr}T00:00`, timezone),
    dateStr,
  }
}

/** Human-readable date label for a company-local day. */
export function formatCompanyDateLabel(
  timezone: string,
  date: Date = new Date(),
  dayOffset = 0
): string {
  const dateStr = shiftCompanyDateString(getCompanyDateString(timezone, date), timezone, dayOffset)
  const anchor = new Date(parseAsCompanyTime(`${dateStr}T12:00`, timezone))

  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(anchor)
}

/** Minutes since local midnight for an ISO timestamp in the company timezone. */
export function getMinutesFromMidnightInTimezone(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))

  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
  return hour * 60 + minute
}

/** Format an ISO timestamp as a short local time label in the company timezone. */
export function formatTimeInTimezone(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString([], {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Treat a datetime-local value as company-local time and convert to UTC ISO. */
export function parseAsCompanyTime(dateTimeStr: string, tz: string): string {
  const date = new Date(dateTimeStr)
  const tzString = date.toLocaleString('en-US', { timeZone: tz })
  const tzDate = new Date(tzString)
  const offset = tzDate.getTime() - date.getTime()
  return new Date(date.getTime() - offset).toISOString()
}

/** Convert a UTC ISO string to datetime-local format in the company timezone. */
export function formatForDatetimeLocal(isoString: string, tz: string): string {
  const date = new Date(isoString)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}