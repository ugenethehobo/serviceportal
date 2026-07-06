export type BookingMode = 'online_booking' | 'request_form'

export type BookingSettings = {
  welcome_message: string | null
  request_form_heading: string | null
  online_booking_heading: string | null
  /** Minutes of travel/prep time required between jobs on the same crew. */
  travel_buffer_minutes: number
  /** Earliest bookable slot is this many hours from now. */
  min_notice_hours: number
  /** Minutes between offered online booking start times. */
  slot_interval_minutes: number
  /** How many days ahead clients can book (company timezone). */
  lookahead_days: number
  /** 0=Sun … 6=Sat — days shown on the public booking calendar. */
  bookable_weekdays: number[]
}

export type BookableService = {
  id: string
  company_id: string
  name: string
  description: string | null
  duration_minutes: number
  price_estimate: number | null
  active: boolean
  sort_order: number
}

export const DEFAULT_BOOKABLE_WEEKDAYS = [1, 2, 3, 4, 5] as const

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  welcome_message: null,
  request_form_heading: 'Request service',
  online_booking_heading: 'Book online',
  travel_buffer_minutes: 15,
  min_notice_hours: 2,
  slot_interval_minutes: 30,
  lookahead_days: 28,
  bookable_weekdays: [...DEFAULT_BOOKABLE_WEEKDAYS],
}

const VALID_WEEKDAYS = new Set([0, 1, 2, 3, 4, 5, 6])

function normalizeBookableWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_BOOKABLE_WEEKDAYS]
  const days = value
    .filter((day): day is number => typeof day === 'number' && VALID_WEEKDAYS.has(day))
    .filter((day, index, list) => list.indexOf(day) === index)
    .sort((a, b) => a - b)
  return days.length > 0 ? days : [...DEFAULT_BOOKABLE_WEEKDAYS]
}

export function normalizeBookingMode(value: unknown): BookingMode {
  return value === 'online_booking' ? 'online_booking' : 'request_form'
}

export function normalizeBookingSettings(input: unknown): BookingSettings {
  if (!input || typeof input !== 'object') return DEFAULT_BOOKING_SETTINGS

  const raw = input as Partial<BookingSettings>
  return {
    welcome_message:
      typeof raw.welcome_message === 'string'
        ? raw.welcome_message.trim() || null
        : null,
    request_form_heading:
      typeof raw.request_form_heading === 'string' && raw.request_form_heading.trim()
        ? raw.request_form_heading.trim()
        : DEFAULT_BOOKING_SETTINGS.request_form_heading,
    online_booking_heading:
      typeof raw.online_booking_heading === 'string' && raw.online_booking_heading.trim()
        ? raw.online_booking_heading.trim()
        : DEFAULT_BOOKING_SETTINGS.online_booking_heading,
    travel_buffer_minutes:
      typeof raw.travel_buffer_minutes === 'number' && raw.travel_buffer_minutes >= 0
        ? Math.min(120, Math.round(raw.travel_buffer_minutes))
        : DEFAULT_BOOKING_SETTINGS.travel_buffer_minutes,
    min_notice_hours:
      typeof raw.min_notice_hours === 'number' && raw.min_notice_hours >= 0
        ? Math.min(168, Math.round(raw.min_notice_hours))
        : DEFAULT_BOOKING_SETTINGS.min_notice_hours,
    slot_interval_minutes:
      typeof raw.slot_interval_minutes === 'number' && raw.slot_interval_minutes >= 15
        ? Math.min(120, Math.round(raw.slot_interval_minutes))
        : DEFAULT_BOOKING_SETTINGS.slot_interval_minutes,
    lookahead_days:
      typeof raw.lookahead_days === 'number' && raw.lookahead_days >= 1
        ? Math.min(90, Math.round(raw.lookahead_days))
        : DEFAULT_BOOKING_SETTINGS.lookahead_days,
    bookable_weekdays: normalizeBookableWeekdays(raw.bookable_weekdays),
  }
}

export function slugifyBookingSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function isValidBookingSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 48
}

export function suggestBookingSlug(companyName: string): string {
  const base = slugifyBookingSlug(companyName)
  return base.length >= 3 ? base : 'book-service'
}

export function getPublicBookingUrl(slug: string, appUrl?: string): string {
  const base = (appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(
    /\/$/,
    ''
  )
  return `${base}/book/${slug}`
}