import { buildArAgingData } from '@/lib/ar-aging'
import {
  normalizeNotificationPreferences,
  type NotificationEvent,
  type NotificationReminderSettings,
} from '@/lib/notifications'
import { getCompanyDayBounds, getCompanyDateString } from '@/lib/timezone'

export type VisitReminderCandidate = {
  scheduleId: string
  clientId: string
  companyId: string
  title: string
  startTime: string
  endTime: string
  visitDay: string
}

export type InvoiceOverdueReminderCandidate = {
  scheduleId: string
  clientId: string
  companyId: string
  jobTitle: string
  balanceDue: number
  daysOutstanding: number
  dueDate: string
  overdueOffset: number
}

export function getVisitReminderDayOffset(hoursBefore: number): number {
  return Math.max(1, Math.round(hoursBefore / 24))
}

export function getVisitReminderWindow(
  timezone: string,
  now: Date,
  hoursBefore: number
) {
  const dayOffset = getVisitReminderDayOffset(hoursBefore)
  return getCompanyDayBounds(timezone, now, dayOffset)
}

export function shouldSendInvoiceOverdueReminder(
  daysOutstanding: number,
  configuredOffsets: number[]
): number | null {
  const match = configuredOffsets.find((offset) => offset === daysOutstanding)
  return match ?? null
}

export function buildVisitReminderCandidates(input: {
  schedules: Array<{
    id: string
    client_id: string
    title: string
    start_time: string
    end_time: string
    status: string
    client: { company_id: string } | { company_id: string }[] | null
  }>
  timezone: string
  now?: Date
  hoursBefore: number
}): VisitReminderCandidate[] {
  const now = input.now ?? new Date()
  const window = getVisitReminderWindow(input.timezone, now, input.hoursBefore)

  return input.schedules
    .filter((schedule) => ['scheduled', 'in_progress'].includes(schedule.status))
    .filter(
      (schedule) =>
        schedule.start_time >= window.startIso && schedule.start_time < window.endIso
    )
    .map((schedule) => {
      const client = Array.isArray(schedule.client) ? schedule.client[0] : schedule.client
      if (!client?.company_id) return null

      return {
        scheduleId: schedule.id,
        clientId: schedule.client_id,
        companyId: client.company_id,
        title: schedule.title,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        visitDay: getCompanyDateString(input.timezone, new Date(schedule.start_time)),
      }
    })
    .filter((candidate): candidate is VisitReminderCandidate => candidate !== null)
}

export function buildInvoiceOverdueReminderCandidates(input: {
  companyId: string
  schedules: Array<{
    id: string
    client_id: string
    title: string
    status: string
    start_time: string
    end_time: string
  }>
  lineItems: Array<{ schedule_id: string; amount: number; created_at: string }>
  payments: Array<{ schedule_id: string; amount: number }>
  clients: Array<{ id: string; name: string }>
  invoiceDocuments: Array<{ schedule_id: string; id: string; created_at: string }>
  overdueOffsets: number[]
  now?: Date
}): InvoiceOverdueReminderCandidate[] {
  const aging = buildArAgingData({
    schedules: input.schedules,
    lineItems: input.lineItems,
    payments: input.payments,
    clients: input.clients,
    invoiceDocuments: input.invoiceDocuments,
    now: input.now,
  })

  const results: InvoiceOverdueReminderCandidate[] = []

  for (const invoice of aging.invoices) {
    if (!invoice.invoiceDocumentId) continue

    const overdueOffset = shouldSendInvoiceOverdueReminder(
      invoice.daysOutstanding,
      input.overdueOffsets
    )
    if (!overdueOffset) continue

    results.push({
      scheduleId: invoice.scheduleId,
      clientId: invoice.clientId,
      companyId: input.companyId,
      jobTitle: invoice.jobTitle,
      balanceDue: invoice.balanceDue,
      daysOutstanding: invoice.daysOutstanding,
      dueDate: invoice.dueDate,
      overdueOffset,
    })
  }

  return results
}

export function buildNotificationDedupMetadata(
  event: NotificationEvent,
  metadata: Record<string, string | number | null | undefined>
) {
  return metadata
}

export type ReminderCronResult = {
  checked: number
  sent: number
  skipped: number
}

export function getCompanyReminderSettings(
  notificationSettings: unknown
): NotificationReminderSettings {
  return normalizeNotificationPreferences(notificationSettings).reminders
}