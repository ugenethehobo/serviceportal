import {
  getCompanyDateString,
  getCompanyDayBounds,
  getMinutesFromMidnightInTimezone,
  getWeekdayInCompanyTimezone,
  parseAsCompanyTime,
} from '@/lib/timezone'

export type BusinessHours = {
  start: string
  end: string
  /** 0=Sun … 6=Sat — days the company operates */
  openWeekdays: number[]
}

/** Mon–Fri by default; weekends closed until configured otherwise. */
export const DEFAULT_OPEN_WEEKDAYS = [1, 2, 3, 4, 5] as const

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  start: '08:00',
  end: '17:00',
  openWeekdays: [...DEFAULT_OPEN_WEEKDAYS],
}

export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sunday', shortLabel: 'Sun' },
  { value: 1, label: 'Monday', shortLabel: 'Mon' },
  { value: 2, label: 'Tuesday', shortLabel: 'Tue' },
  { value: 3, label: 'Wednesday', shortLabel: 'Wed' },
  { value: 4, label: 'Thursday', shortLabel: 'Thu' },
  { value: 5, label: 'Friday', shortLabel: 'Fri' },
  { value: 6, label: 'Saturday', shortLabel: 'Sat' },
] as const

const VALID_WEEKDAYS = new Set([0, 1, 2, 3, 4, 5, 6])

export function normalizeOpenWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_OPEN_WEEKDAYS]

  const days = value
    .filter((day): day is number => typeof day === 'number' && VALID_WEEKDAYS.has(day))
    .filter((day, index, list) => list.indexOf(day) === index)
    .sort((a, b) => a - b)

  return days.length > 0 ? days : [...DEFAULT_OPEN_WEEKDAYS]
}

export function normalizeBusinessHours(
  start?: string | null,
  end?: string | null,
  openWeekdays?: unknown
): BusinessHours {
  return {
    start: isValidTimeValue(start) ? start! : DEFAULT_BUSINESS_HOURS.start,
    end: isValidTimeValue(end) ? end! : DEFAULT_BUSINESS_HOURS.end,
    openWeekdays: normalizeOpenWeekdays(openWeekdays),
  }
}

export function isValidTimeValue(value?: string | null): value is string {
  if (!value) return false
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function isOpenWeekday(weekday: number, openWeekdays: number[]): boolean {
  if (openWeekdays.length === 0) return true
  return openWeekdays.includes(weekday)
}

export function isOpenOnDate(
  dateStr: string,
  timezone: string,
  openWeekdays: number[]
): boolean {
  return isOpenWeekday(getWeekdayInCompanyTimezone(dateStr, timezone), openWeekdays)
}

export function isOpenAtInstant(
  iso: string,
  timezone: string,
  businessHours: Pick<BusinessHours, 'openWeekdays'>
): boolean {
  const dateStr = getCompanyDateString(timezone, new Date(iso))
  return isOpenOnDate(dateStr, timezone, businessHours.openWeekdays)
}

export function getClosedDayError(dateStr: string, timezone: string): string {
  const weekday = getWeekdayInCompanyTimezone(dateStr, timezone)
  const label =
    WEEKDAY_OPTIONS.find((option) => option.value === weekday)?.label ?? 'That day'
  return `${label} is marked closed in your business hours`
}

export function parseTimeToMinutes(time: string): number {
  const [hourStr, minuteStr] = time.split(':')
  return parseInt(hourStr, 10) * 60 + parseInt(minuteStr || '0', 10)
}

export function formatMinutesAsTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes))
  const hour = Math.floor(clamped / 60)
  const minute = clamped % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function formatHourLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: minute === 0 ? undefined : '2-digit' })
}

export function getTimelineHourLabels(businessHours: BusinessHours): string[] {
  const start = parseTimeToMinutes(businessHours.start)
  const end = parseTimeToMinutes(businessHours.end)
  const labels: string[] = []

  for (let minute = start; minute <= end; minute += 60) {
    labels.push(formatHourLabel(minute))
  }

  return labels
}

export function getTimelineDurationMinutes(businessHours: BusinessHours): number {
  const start = parseTimeToMinutes(businessHours.start)
  const end = parseTimeToMinutes(businessHours.end)
  return Math.max(60, end - start)
}

export function minutesToTimelinePercent(
  minutes: number,
  businessHours: BusinessHours
): number {
  const start = parseTimeToMinutes(businessHours.start)
  const end = parseTimeToMinutes(businessHours.end)
  const total = Math.max(1, end - start)
  return ((minutes - start) / total) * 100
}

export function isValidBusinessHoursRange(businessHours: BusinessHours): boolean {
  if (!isValidTimeValue(businessHours.start) || !isValidTimeValue(businessHours.end)) {
    return false
  }
  if (businessHours.openWeekdays.length === 0) {
    return false
  }
  return parseTimeToMinutes(businessHours.start) < parseTimeToMinutes(businessHours.end)
}

export const UPCOMING_OPEN_DAYS_PREVIEW_COUNT = 5

/** True when the company calendar day is marked closed (weekends, etc.). */
export function isClosedDayToday(
  timezone: string,
  businessHours: Pick<BusinessHours, 'openWeekdays'>,
  now: Date = new Date()
): boolean {
  const todayStr = getCompanyDateString(timezone, now)
  return !isOpenOnDate(todayStr, timezone, businessHours.openWeekdays)
}

/** After business close on an open day, preview tomorrow on the timeline. */
export function shouldShowTomorrowTimeline(
  timezone: string,
  businessHours: BusinessHours,
  now: Date = new Date()
): boolean {
  if (isClosedDayToday(timezone, businessHours, now)) {
    return false
  }

  const nowMinutes = getMinutesFromMidnightInTimezone(now.toISOString(), timezone)
  const closeMinutes = parseTimeToMinutes(businessHours.end)
  return nowMinutes >= closeMinutes
}

export type UpcomingOpenDay = {
  dateStr: string
  dayOffset: number
  label: string
  shortLabel: string
}

/** Next N company-local open days after today (or after closed today). */
export function getNextOpenDayDates(
  timezone: string,
  openWeekdays: number[],
  count: number,
  now: Date = new Date(),
  startDayOffset = 1
): UpcomingOpenDay[] {
  const days: UpcomingOpenDay[] = []

  for (let offset = startDayOffset; offset < startDayOffset + 90 && days.length < count; offset += 1) {
    const bounds = getCompanyDayBounds(timezone, now, offset)
    if (!isOpenOnDate(bounds.dateStr, timezone, openWeekdays)) continue

    const anchor = new Date(parseAsCompanyTime(`${bounds.dateStr}T12:00`, timezone))
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(anchor)
    const shortLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(anchor)

    days.push({
      dateStr: bounds.dateStr,
      dayOffset: offset,
      label,
      shortLabel,
    })
  }

  return days
}

export function formatUpcomingOpenDaysRangeLabel(days: UpcomingOpenDay[]): string {
  if (days.length === 0) return ''
  if (days.length === 1) return days[0].label
  return `${days[0].label} – ${days[days.length - 1].label}`
}