import type { SupabaseClient } from '@supabase/supabase-js'
import { duplicateBillingToSchedule } from '@/lib/billing-server'
import { syncJobInvoiceDocument } from '@/lib/invoices-server'

export type SupabaseAdmin = SupabaseClient

export type ScheduleStatusSyncResult = {
  activated: number
  archived: number
}

export const SCHEDULE_STATUS_SYNC_THROTTLE_MS = 120_000

const lastCompanySyncAt = new Map<string, number>()

/** @internal Test helper */
export function resetScheduleStatusSyncThrottleForTests() {
  lastCompanySyncAt.clear()
}

type ScheduleRow = {
  id: string
  client_id: string
  crew_id: string | null
  recurring_rule_id: string | null
  title: string
  description: string | null
  start_time: string
  end_time: string
  status: string
  price: number | null
}

async function generateNextRecurringInstance(
  currentSchedule: ScheduleRow,
  supabaseAdmin: SupabaseAdmin
) {
  if (!currentSchedule.recurring_rule_id) return

  const { data: rule } = await supabaseAdmin
    .from('recurring_rules')
    .select('*')
    .eq('id', currentSchedule.recurring_rule_id)
    .single()

  if (!rule) return

  const currentEnd = new Date(currentSchedule.end_time)
  const nextStart = new Date(currentEnd)

  switch (rule.frequency) {
    case 'daily':
      nextStart.setDate(nextStart.getDate() + (rule.interval || 1))
      break
    case 'weekly':
      nextStart.setDate(nextStart.getDate() + 7 * (rule.interval || 1))
      break
    case 'monthly':
      nextStart.setMonth(nextStart.getMonth() + (rule.interval || 1))
      break
    default:
      return
  }

  const duration =
    new Date(currentSchedule.end_time).getTime() -
    new Date(currentSchedule.start_time).getTime()
  const nextEnd = new Date(nextStart.getTime() + duration)

  let hasConflict = false
  if (currentSchedule.crew_id) {
    const { data: conflicts } = await supabaseAdmin
      .from('schedules')
      .select('id')
      .eq('crew_id', currentSchedule.crew_id)
      .neq('status', 'archived')
      .lte('start_time', nextEnd.toISOString())
      .gte('end_time', nextStart.toISOString())

    hasConflict = !!(conflicts && conflicts.length > 0)
  }

  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('company_id')
    .eq('id', currentSchedule.client_id)
    .single()

  const { data: newSchedule, error: insertError } = await supabaseAdmin
    .from('schedules')
    .insert({
      client_id: currentSchedule.client_id,
      crew_id: currentSchedule.crew_id,
      recurring_rule_id: currentSchedule.recurring_rule_id,
      title: currentSchedule.title,
      description: currentSchedule.description,
      start_time: nextStart.toISOString(),
      end_time: nextEnd.toISOString(),
      status: 'scheduled',
      price: currentSchedule.price || 0,
    })
    .select()
    .single()

  if (insertError || !newSchedule) {
    console.error('Failed to create recurring schedule:', insertError)
    return
  }

  if (client?.company_id) {
    await duplicateBillingToSchedule(
      supabaseAdmin,
      currentSchedule.id,
      newSchedule.id,
      currentSchedule.client_id,
      client.company_id,
      {
        title: currentSchedule.title,
        price: currentSchedule.price || 0,
      }
    )
    try {
      await syncJobInvoiceDocument(newSchedule.id)
    } catch (invoiceError) {
      console.error('generateNextRecurringInstance invoice sync error:', invoiceError)
    }
  }

  if (hasConflict) {
    console.log(
      `Created next recurring schedule for ${currentSchedule.id} but crew has conflict`
    )
  }
}

async function getCompanyClientIds(
  supabaseAdmin: SupabaseAdmin,
  companyId: string
): Promise<string[]> {
  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('company_id', companyId)

  if (error) throw error
  return (clients || []).map((client) => client.id)
}

/**
 * Batch-activate and batch-archive schedules for all clients in a company.
 * Recurring follow-ups still run per archived recurring job.
 */
export async function syncCompanyScheduleStatuses(
  supabaseAdmin: SupabaseAdmin,
  companyId: string
): Promise<ScheduleStatusSyncResult> {
  const clientIds = await getCompanyClientIds(supabaseAdmin, companyId)
  if (clientIds.length === 0) {
    return { activated: 0, archived: 0 }
  }

  const now = new Date().toISOString()

  const { data: activatedRows, error: activateError } = await supabaseAdmin
    .from('schedules')
    .update({ status: 'in_progress' })
    .in('client_id', clientIds)
    .eq('status', 'scheduled')
    .lte('start_time', now)
    .gt('end_time', now)
    .select('id')

  if (activateError) throw activateError

  const { data: toArchive, error: archiveSelectError } = await supabaseAdmin
    .from('schedules')
    .select(
      'id, client_id, crew_id, recurring_rule_id, title, description, start_time, end_time, status, price'
    )
    .in('client_id', clientIds)
    .neq('status', 'archived')
    .lt('end_time', now)

  if (archiveSelectError) throw archiveSelectError

  if (!toArchive?.length) {
    return { activated: activatedRows?.length ?? 0, archived: 0 }
  }

  const archiveIds = toArchive.map((schedule) => schedule.id)
  const { error: archiveUpdateError } = await supabaseAdmin
    .from('schedules')
    .update({ status: 'archived' })
    .in('id', archiveIds)

  if (archiveUpdateError) throw archiveUpdateError

  const recurringSchedules = toArchive.filter((schedule) => schedule.recurring_rule_id)
  for (const schedule of recurringSchedules) {
    await generateNextRecurringInstance(schedule as ScheduleRow, supabaseAdmin)
  }

  return {
    activated: activatedRows?.length ?? 0,
    archived: toArchive.length,
  }
}

/** Sync schedules for a single client (manual refresh from client detail). */
export async function syncClientScheduleStatuses(
  supabaseAdmin: SupabaseAdmin,
  clientId: string
): Promise<ScheduleStatusSyncResult> {
  const now = new Date().toISOString()

  const { data: activatedRows, error: activateError } = await supabaseAdmin
    .from('schedules')
    .update({ status: 'in_progress' })
    .eq('client_id', clientId)
    .eq('status', 'scheduled')
    .lte('start_time', now)
    .gt('end_time', now)
    .select('id')

  if (activateError) throw activateError

  const { data: toArchive, error: archiveSelectError } = await supabaseAdmin
    .from('schedules')
    .select(
      'id, client_id, crew_id, recurring_rule_id, title, description, start_time, end_time, status, price'
    )
    .eq('client_id', clientId)
    .neq('status', 'archived')
    .lt('end_time', now)

  if (archiveSelectError) throw archiveSelectError

  if (!toArchive?.length) {
    return { activated: activatedRows?.length ?? 0, archived: 0 }
  }

  const archiveIds = toArchive.map((schedule) => schedule.id)
  const { error: archiveUpdateError } = await supabaseAdmin
    .from('schedules')
    .update({ status: 'archived' })
    .in('id', archiveIds)

  if (archiveUpdateError) throw archiveUpdateError

  for (const schedule of toArchive) {
    if (schedule.recurring_rule_id) {
      await generateNextRecurringInstance(schedule as ScheduleRow, supabaseAdmin)
    }
  }

  return {
    activated: activatedRows?.length ?? 0,
    archived: toArchive.length,
  }
}

export function shouldThrottleScheduleStatusSync(
  companyId: string,
  nowMs: number = Date.now()
): boolean {
  const lastSync = lastCompanySyncAt.get(companyId)
  if (lastSync === undefined) return false
  return nowMs - lastSync < SCHEDULE_STATUS_SYNC_THROTTLE_MS
}

/**
 * Throttled company sync for read paths. Returns null when skipped.
 * Marks throttle window even when no rows changed.
 */
export async function maybeSyncCompanyScheduleStatuses(
  supabaseAdmin: SupabaseAdmin,
  companyId: string,
  options?: { force?: boolean }
): Promise<ScheduleStatusSyncResult | null> {
  if (!options?.force && shouldThrottleScheduleStatusSync(companyId)) {
    return null
  }

  const result = await syncCompanyScheduleStatuses(supabaseAdmin, companyId)
  lastCompanySyncAt.set(companyId, Date.now())
  return result
}

/** Fire-and-forget sync for dashboard/calendar loads — never blocks the response. */
export function queueCompanyScheduleStatusSync(
  supabaseAdmin: SupabaseAdmin,
  companyId: string
): void {
  void maybeSyncCompanyScheduleStatuses(supabaseAdmin, companyId).catch((error) => {
    console.error('queueCompanyScheduleStatusSync error:', error)
  })
}

/** Cron entry: sync every company with batched queries per tenant. */
export async function syncAllCompaniesScheduleStatuses(
  supabaseAdmin: SupabaseAdmin
): Promise<{
  companies: number
  activated: number
  archived: number
}> {
  const { data: companies, error } = await supabaseAdmin.from('companies').select('id')
  if (error) throw error

  let activated = 0
  let archived = 0

  for (const company of companies || []) {
    const result = await syncCompanyScheduleStatuses(supabaseAdmin, company.id)
    activated += result.activated
    archived += result.archived
    lastCompanySyncAt.set(company.id, Date.now())
  }

  return {
    companies: companies?.length ?? 0,
    activated,
    archived,
  }
}