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