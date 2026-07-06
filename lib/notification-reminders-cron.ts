import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildInvoiceOverdueReminderCandidates,
  buildVisitReminderCandidates,
  getCompanyReminderSettings,
  type ReminderCronResult,
} from '@/lib/notification-reminders'
import {
  notifyClientInvoiceOverdueReminder,
  notifyClientVisitReminder,
  queueNotification,
} from '@/lib/notifications-server'
import { getCompanyDayBounds } from '@/lib/timezone'

async function wasNotificationSent(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  eventType: string,
  filters: Array<[string, string]>
) {
  let query = supabaseAdmin
    .from('notification_log')
    .select('id')
    .eq('company_id', companyId)
    .eq('event_type', eventType)
    .limit(1)

  for (const [key, value] of filters) {
    query = query.filter(`metadata->>${key}`, 'eq', value)
  }

  const { data } = await query.maybeSingle()
  return !!data
}

export async function runVisitReminderCron(
  supabaseAdmin: SupabaseClient,
  now: Date = new Date()
): Promise<ReminderCronResult> {
  const { data: companies, error } = await supabaseAdmin
    .from('companies')
    .select('id, name, timezone, notification_settings')

  if (error) throw error

  let checked = 0
  let sent = 0
  let skipped = 0

  for (const company of companies || []) {
    const timezone = company.timezone || 'America/Chicago'
    const reminders = getCompanyReminderSettings(company.notification_settings)
    const window = getCompanyDayBounds(
      timezone,
      now,
      Math.max(1, Math.round(reminders.visit_hours_before / 24))
    )

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('company_id', company.id)

    const clientIds = clients?.map((client) => client.id) || []
    if (clientIds.length === 0) continue

    const { data: schedules } = await supabaseAdmin
      .from('schedules')
      .select(`
        id,
        client_id,
        title,
        start_time,
        end_time,
        status,
        client:clients!client_id (company_id)
      `)
      .in('client_id', clientIds)
      .in('status', ['scheduled', 'in_progress'])
      .gte('start_time', window.startIso)
      .lt('start_time', window.endIso)

    const candidates = buildVisitReminderCandidates({
      schedules: schedules || [],
      timezone,
      now,
      hoursBefore: reminders.visit_hours_before,
    })

    checked += candidates.length

    for (const candidate of candidates) {
      const alreadySent = await wasNotificationSent(
        supabaseAdmin,
        company.id,
        'visit_reminder',
        [
          ['schedule_id', candidate.scheduleId],
          ['visit_day', candidate.visitDay],
        ]
      )

      if (alreadySent) {
        skipped += 1
        continue
      }

      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('name, email, phone')
        .eq('id', candidate.clientId)
        .single()

      if (!client?.email && !client?.phone) {
        skipped += 1
        continue
      }

      await queueNotification(supabaseAdmin, async (admin) => {
        await notifyClientVisitReminder(admin, {
          companyId: company.id,
          companyName: company.name,
          clientId: candidate.clientId,
          clientEmail: client.email,
          clientPhone: client.phone,
          clientName: client.name,
          jobTitle: candidate.title,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          scheduleId: candidate.scheduleId,
          visitDay: candidate.visitDay,
        })
      })

      sent += 1
    }
  }

  return { checked, sent, skipped }
}

export async function runInvoiceOverdueReminderCron(
  supabaseAdmin: SupabaseClient,
  now: Date = new Date()
): Promise<ReminderCronResult> {
  const { data: companies, error } = await supabaseAdmin
    .from('companies')
    .select('id, name, notification_settings')

  if (error) throw error

  let checked = 0
  let sent = 0
  let skipped = 0

  for (const company of companies || []) {
    const reminders = getCompanyReminderSettings(company.notification_settings)
    const overdueOffsets = reminders.invoice_overdue_day_offsets
    if (overdueOffsets.length === 0) continue

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id, name')
      .eq('company_id', company.id)

    const clientIds = clients?.map((client) => client.id) || []
    if (clientIds.length === 0) continue

    const { data: schedules } = await supabaseAdmin
      .from('schedules')
      .select('id, client_id, title, status, start_time, end_time')
      .in('client_id', clientIds)
      .neq('status', 'cancelled')

    const scheduleIds = schedules?.map((schedule) => schedule.id) || []
    if (scheduleIds.length === 0) continue

    const [{ data: lineItems }, { data: payments }, { data: invoiceDocuments }] =
      await Promise.all([
        supabaseAdmin
          .from('billing_line_items')
          .select('schedule_id, amount, created_at')
          .in('schedule_id', scheduleIds),
        supabaseAdmin
          .from('billing_payments')
          .select('schedule_id, amount')
          .in('schedule_id', scheduleIds),
        supabaseAdmin
          .from('client_documents')
          .select('schedule_id, id, created_at')
          .eq('source', 'invoice')
          .in('schedule_id', scheduleIds),
      ])

    const candidates = buildInvoiceOverdueReminderCandidates({
      companyId: company.id,
      schedules: schedules || [],
      lineItems: lineItems || [],
      payments: payments || [],
      clients: clients || [],
      invoiceDocuments: invoiceDocuments || [],
      overdueOffsets,
      now,
    })

    checked += candidates.length

    for (const candidate of candidates) {
      const alreadySent = await wasNotificationSent(
        supabaseAdmin,
        company.id,
        'invoice_overdue_reminder',
        [
          ['schedule_id', candidate.scheduleId],
          ['overdue_offset', String(candidate.overdueOffset)],
        ]
      )

      if (alreadySent) {
        skipped += 1
        continue
      }

      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('name, email, phone')
        .eq('id', candidate.clientId)
        .single()

      if (!client?.email && !client?.phone) {
        skipped += 1
        continue
      }

      await queueNotification(supabaseAdmin, async (admin) => {
        await notifyClientInvoiceOverdueReminder(admin, {
          companyId: company.id,
          companyName: company.name,
          clientId: candidate.clientId,
          clientEmail: client.email,
          clientPhone: client.phone,
          clientName: client.name,
          jobTitle: candidate.jobTitle,
          balanceDue: candidate.balanceDue,
          daysOutstanding: candidate.daysOutstanding,
          overdueOffset: candidate.overdueOffset,
          scheduleId: candidate.scheduleId,
        })
      })

      sent += 1
    }
  }

  return { checked, sent, skipped }
}