export type NotificationEvent =
  | 'message_from_staff'
  | 'message_from_client'
  | 'estimate_sent'
  | 'estimate_response'
  | 'invoice_sent'
  | 'payment_received'
  | 'lead_follow_up_due'

export type NotificationChannel = 'email' | 'sms'

export type NotificationEventPreferences = {
  email?: boolean
  sms?: boolean
}

export type NotificationPreferences = {
  email_enabled: boolean
  sms_enabled: boolean
  reply_to_email: string | null
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
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email_enabled: true,
  sms_enabled: true,
  reply_to_email: null,
  events: {
    message_from_staff: { email: true, sms: true },
    message_from_client: { email: true, sms: false },
    estimate_sent: { email: true, sms: true },
    estimate_response: { email: true, sms: false },
    invoice_sent: { email: true, sms: true },
    payment_received: { email: true, sms: false },
    lead_follow_up_due: { email: true, sms: false },
  },
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