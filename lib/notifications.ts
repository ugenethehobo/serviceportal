export type NotificationEvent =
  | 'message_from_staff'
  | 'message_from_client'
  | 'estimate_sent'
  | 'estimate_response'
  | 'invoice_sent'
  | 'payment_received'
  | 'lead_follow_up_due'
  | 'visit_reminder'
  | 'invoice_overdue_reminder'
  | 'online_booking_received'

export type NotificationChannel = 'email' | 'sms'

export type NotificationEventPreferences = {
  email?: boolean
  sms?: boolean
}

export type NotificationReminderSettings = {
  /** Hours before visit start to send the client reminder (daily cron). */
  visit_hours_before: number
  /** Send a client overdue reminder when balance is exactly this many days past due. */
  invoice_overdue_day_offsets: number[]
}

export type NotificationPreferences = {
  email_enabled: boolean
  sms_enabled: boolean
  reply_to_email: string | null
  reminders: NotificationReminderSettings
  events: Partial<Record<NotificationEvent, NotificationEventPreferences>>
}

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  message_from_staff: 'New message to client',
  message_from_client: 'New message from client',
  estimate_sent: 'Estimate ready for client',
  estimate_response: 'Client estimate response',
  invoice_sent: 'Invoice ready for client',
  payment_received: 'Payment received',
  lead_follow_up_due: 'Lead follow-up reminder',
  visit_reminder: 'Upcoming visit reminder (client)',
  invoice_overdue_reminder: 'Invoice overdue reminder (client)',
  online_booking_received: 'New online booking (staff)',
}

export const DEFAULT_NOTIFICATION_REMINDER_SETTINGS: NotificationReminderSettings = {
  visit_hours_before: 24,
  invoice_overdue_day_offsets: [7, 14, 30],
}

const VALID_INVOICE_OVERDUE_OFFSETS = new Set([1, 3, 7, 14, 21, 30, 45, 60, 90])

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email_enabled: true,
  sms_enabled: true,
  reply_to_email: null,
  reminders: DEFAULT_NOTIFICATION_REMINDER_SETTINGS,
  events: {
    message_from_staff: { email: true, sms: true },
    message_from_client: { email: true, sms: false },
    estimate_sent: { email: true, sms: true },
    estimate_response: { email: true, sms: false },
    invoice_sent: { email: true, sms: true },
    payment_received: { email: true, sms: false },
    lead_follow_up_due: { email: true, sms: false },
    visit_reminder: { email: true, sms: true },
    invoice_overdue_reminder: { email: true, sms: true },
    online_booking_received: { email: true, sms: false },
  },
}

export function normalizeReminderSettings(
  input: unknown
): NotificationReminderSettings {
  const defaults = DEFAULT_NOTIFICATION_REMINDER_SETTINGS
  if (!input || typeof input !== 'object') return defaults

  const raw = input as Partial<NotificationReminderSettings>
  const visitHours =
    typeof raw.visit_hours_before === 'number' && raw.visit_hours_before >= 1
      ? Math.min(168, Math.round(raw.visit_hours_before))
      : defaults.visit_hours_before

  const offsets = Array.isArray(raw.invoice_overdue_day_offsets)
    ? raw.invoice_overdue_day_offsets
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= 365)
        .map((value) => Math.round(value))
        .filter((value, index, list) => list.indexOf(value) === index)
        .sort((a, b) => a - b)
    : defaults.invoice_overdue_day_offsets

  return {
    visit_hours_before: visitHours,
    invoice_overdue_day_offsets:
      offsets.length > 0 ? offsets : defaults.invoice_overdue_day_offsets,
  }
}

export function normalizeInvoiceOverdueOffsets(values: number[]): number[] {
  return values
    .map((value) => Math.round(value))
    .filter((value) => VALID_INVOICE_OVERDUE_OFFSETS.has(value))
    .filter((value, index, list) => list.indexOf(value) === index)
    .sort((a, b) => a - b)
}

export function normalizeNotificationPreferences(
  input: unknown
): NotificationPreferences {
  const defaults = DEFAULT_NOTIFICATION_PREFERENCES
  if (!input || typeof input !== 'object') return defaults

  const raw = input as Partial<NotificationPreferences>
  const events: NotificationPreferences['events'] = { ...defaults.events }

  if (raw.events && typeof raw.events === 'object') {
    for (const [key, value] of Object.entries(raw.events)) {
      if (!value || typeof value !== 'object') continue
      const eventKey = key as NotificationEvent
      if (!(eventKey in NOTIFICATION_EVENT_LABELS)) continue
      events[eventKey] = {
        email:
          typeof (value as NotificationEventPreferences).email === 'boolean'
            ? (value as NotificationEventPreferences).email
            : defaults.events[eventKey]?.email,
        sms:
          typeof (value as NotificationEventPreferences).sms === 'boolean'
            ? (value as NotificationEventPreferences).sms
            : defaults.events[eventKey]?.sms,
      }
    }
  }

  return {
    email_enabled:
      typeof raw.email_enabled === 'boolean'
        ? raw.email_enabled
        : defaults.email_enabled,
    sms_enabled:
      typeof raw.sms_enabled === 'boolean' ? raw.sms_enabled : defaults.sms_enabled,
    reply_to_email:
      typeof raw.reply_to_email === 'string'
        ? raw.reply_to_email.trim() || null
        : defaults.reply_to_email,
    reminders: normalizeReminderSettings(raw.reminders),
    events,
  }
}

export function isChannelEnabledForEvent(
  preferences: NotificationPreferences,
  event: NotificationEvent,
  channel: NotificationChannel
): boolean {
  if (channel === 'email' && !preferences.email_enabled) return false
  if (channel === 'sms' && !preferences.sms_enabled) return false
  const eventPrefs = preferences.events[event]
  if (!eventPrefs) return channel === 'email'
  return channel === 'email' ? !!eventPrefs.email : !!eventPrefs.sms
}

export function normalizePhoneForSms(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits.length >= 10 ? digits : null
}