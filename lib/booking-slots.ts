import type { BookingSettings } from '@/lib/booking'
import {
  parseTimeToMinutes,
  type BusinessHours,
} from '@/lib/business-hours'
import { schedulesOverlapWithBuffer } from '@/lib/schedule-conflicts'
import { buildIsoFromDayAndMinutes } from '@/lib/schedule-calendar'
import {
  formatTimeInTimezone,
  getCompanyDateString,
  getCompanyDayBounds,
  getWeekdayInCompanyTimezone,
} from '@/lib/timezone'

export const BOOKING_SLOT_INTERVAL_MINUTES = 30
export const BOOKING_LOOKAHEAD_DAYS = 28

export type BookingSlot = {
  startIso: string
  endIso: string
  startMinutes: number
  label: string
}

export type BookingScheduleConflict = {
  crew_id: string | null
  start_time: string
  end_time: string
}

export function isBookableWeekday(
  dateStr: string,
  timezone: string,
  bookableWeekdays: number[]
): boolean {
  if (bookableWeekdays.length === 0) return true
  return bookableWeekdays.includes(getWeekdayInCompanyTimezone(dateStr, timezone))
}

export function isSlotStartAllowed(
  startIso: string,
  minNoticeHours: number,
  now: Date = new Date()
): boolean {
  const earliestMs = now.getTime() + Math.max(0, minNoticeHours) * 60 * 60 * 1000
  return new Date(startIso).getTime() >= earliestMs
}

export function isSlotWithinBusinessHours(
  startMinutes: number,
  durationMinutes: number,
  businessHours: BusinessHours
): boolean {
  const open = parseTimeToMinutes(businessHours.start)
  const close = parseTimeToMinutes(businessHours.end)
  return startMinutes >= open && startMinutes + durationMinutes <= close
}

export function buildBookingSlotStartMinutes(
  businessHours: BusinessHours,
  durationMinutes: number,
  intervalMinutes = BOOKING_SLOT_INTERVAL_MINUTES
): number[] {
  const open = parseTimeToMinutes(businessHours.start)
  const close = parseTimeToMinutes(businessHours.end)
  const starts: number[] = []

  for (let start = open; start + durationMinutes <= close; start += intervalMinutes) {
    starts.push(start)
  }

  return starts
}

export function crewIsAvailableForSlot(input: {
  crewId: string
  startIso: string
  endIso: string
  conflicts: BookingScheduleConflict[]
  bufferMinutes: number
}): boolean {
  return !input.conflicts.some(
    (schedule) =>
      schedule.crew_id === input.crewId &&
      schedulesOverlapWithBuffer(
        schedule.start_time,
        schedule.end_time,
        input.startIso,
        input.endIso,
        input.bufferMinutes
      )
  )
}

export function computeAvailableCrewIdsByStartMinutes(input: {
  dateStr: string
  timezone: string
  businessHours: BusinessHours
  durationMinutes: number
  slotSettings: Pick<
    BookingSettings,
    'slot_interval_minutes' | 'travel_buffer_minutes' | 'min_notice_hours'
  >
  crewIds: string[]
  conflicts: BookingScheduleConflict[]
  now?: Date
}): Map<number, string[]> {
  const availableByStart = new Map<number, string[]>()
  const slotStarts = buildBookingSlotStartMinutes(
    input.businessHours,
    input.durationMinutes,
    input.slotSettings.slot_interval_minutes
  )

  for (const startMinutes of slotStarts) {
    if (!isSlotWithinBusinessHours(startMinutes, input.durationMinutes, input.businessHours)) {
      continue
    }

    const startIso = buildIsoFromDayAndMinutes(input.dateStr, startMinutes, input.timezone)
    const endIso = buildIsoFromDayAndMinutes(
      input.dateStr,
      startMinutes + input.durationMinutes,
      input.timezone
    )

    if (!isSlotStartAllowed(startIso, input.slotSettings.min_notice_hours, input.now)) {
      continue
    }

    const availableCrewIds = input.crewIds.filter((crewId) =>
      crewIsAvailableForSlot({
        crewId,
        startIso,
        endIso,
        conflicts: input.conflicts,
        bufferMinutes: input.slotSettings.travel_buffer_minutes,
      })
    )

    if (availableCrewIds.length > 0) {
      availableByStart.set(startMinutes, availableCrewIds)
    }
  }

  return availableByStart
}

export function buildBookingSlotsForDay(input: {
  dateStr: string
  timezone: string
  businessHours: BusinessHours
  durationMinutes: number
  availableCrewIdsByStartMinutes: Map<number, string[]>
  slotIntervalMinutes?: number
}): BookingSlot[] {
  const starts = buildBookingSlotStartMinutes(
    input.businessHours,
    input.durationMinutes,
    input.slotIntervalMinutes ?? BOOKING_SLOT_INTERVAL_MINUTES
  )
  const slots: BookingSlot[] = []

  for (const startMinutes of starts) {
    const crews = input.availableCrewIdsByStartMinutes.get(startMinutes)
    if (!crews || crews.length === 0) continue

    const startIso = buildIsoFromDayAndMinutes(
      input.dateStr,
      startMinutes,
      input.timezone
    )
    const endIso = buildIsoFromDayAndMinutes(
      input.dateStr,
      startMinutes + input.durationMinutes,
      input.timezone
    )

    slots.push({
      startIso,
      endIso,
      startMinutes,
      label: formatTimeInTimezone(startIso, input.timezone),
    })
  }

  return slots
}

export function pickAutoAssignedCrewId(availableCrewIds: string[]): string | null {
  return availableCrewIds[0] ?? null
}

export function formatBookingSlotTimeLabel(
  startMinutes: number,
  timezone: string,
  dateStr: string
): string {
  const iso = buildIsoFromDayAndMinutes(dateStr, startMinutes, timezone)
  return formatTimeInTimezone(iso, timezone)
}

export function formatBookingDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
}

export function formatBookingPrice(price: number | null | undefined): string | null {
  if (price == null || Number.isNaN(price)) return null
  return price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function getBookingDateOptions(
  timezone: string,
  slotSettings: Pick<BookingSettings, 'lookahead_days' | 'bookable_weekdays'>,
  now = new Date()
) {
  return Array.from({ length: slotSettings.lookahead_days }, (_, index) => {
    const bounds = getCompanyDayBounds(timezone, now, index)
    if (!isBookableWeekday(bounds.dateStr, timezone, slotSettings.bookable_weekdays)) {
      return null
    }
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(bounds.startIso))
    return { dateStr: bounds.dateStr, label }
  }).filter((option): option is { dateStr: string; label: string } => option != null)
}

export function getBookingLastSelectableDateStr(
  timezone: string,
  lookaheadDays: number,
  now = new Date()
): string {
  const lastIndex = Math.max(0, lookaheadDays - 1)
  return getCompanyDayBounds(timezone, now, lastIndex).dateStr
}

export function isBookingDateSelectable(
  dateStr: string,
  timezone: string,
  slotSettings: Pick<BookingSettings, 'lookahead_days' | 'bookable_weekdays'>,
  now = new Date()
): boolean {
  const todayStr = getCompanyDateString(timezone, now)
  if (dateStr < todayStr) return false

  const lastDateStr = getBookingLastSelectableDateStr(
    timezone,
    slotSettings.lookahead_days,
    now
  )
  if (dateStr > lastDateStr) return false

  return isBookableWeekday(dateStr, timezone, slotSettings.bookable_weekdays)
}