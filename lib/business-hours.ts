import { getMinutesFromMidnightInTimezone } from '@/lib/timezone'

export type BusinessHours = {
  start: string
  end: string
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  start: '08:00',
  end: '17:00',
}

export function normalizeBusinessHours(
  start?: string | null,
  end?: string | null
): BusinessHours {
  return {
    start: isValidTimeValue(start) ? start! : DEFAULT_BUSINESS_HOURS.start,
    end: isValidTimeValue(end) ? end! : DEFAULT_BUSINESS_HOURS.end,
  }
}

export function isValidTimeValue(value?: string | null): value is string {
  if (!value) return false
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
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
  return parseTimeToMinutes(businessHours.start) < parseTimeToMinutes(businessHours.end)
}

/** After business close in the company timezone, preview the next day on the timeline. */
export function shouldShowTomorrowTimeline(
  timezone: string,
  businessHours: BusinessHours,
  now: Date = new Date()
): boolean {
  const nowMinutes = getMinutesFromMidnightInTimezone(now.toISOString(), timezone)
  const closeMinutes = parseTimeToMinutes(businessHours.end)
  return nowMinutes >= closeMinutes
}