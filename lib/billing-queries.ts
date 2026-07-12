import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getReportsPeriodBounds,
  type ReportsPeriod,
} from '@/lib/reports'
import { summarizePayments } from '@/lib/billing'

export type PaymentsFilterSource = 'all' | 'manual' | 'stripe'

export const DEFAULT_CLIENTS_PAGE_SIZE = 50
export const DEFAULT_PAYMENTS_PAGE_SIZE = 50
const SCHEDULE_ID_CHUNK_SIZE = 100

export type BillingLineItemRow = {
  id: string
  client_id: string
  schedule_id: string
  amount: number
  created_at: string
}

export type BillingPaymentRow = {
  id: string
  client_id: string
  schedule_id: string
  amount: number
  payment_date: string
  source?: 'manual' | 'stripe' | null
}

export type ReportsScheduleRow = {
  id: string
  client_id: string
  title: string
  status: string
  start_time: string
  end_time: string
  price: number | null
  recurring_rule_id: string | null
  occurrence_origin_start?: string | null
}

export type ScheduleStatusCount = {
  status: string
  count: number
}

function chunkValues<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return []
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>()
  for (const row of rows) {
    map.set(row.id, row)
  }
  return Array.from(map.values())
}

function toPaymentDateIso(date: Date) {
  return date.toISOString().slice(0, 10)
}

export async function fetchBillingRowsForScheduleIds(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  scheduleIds: string[]
): Promise<{ lineItems: BillingLineItemRow[]; payments: BillingPaymentRow[] }> {
  if (scheduleIds.length === 0) {
    return { lineItems: [], payments: [] }
  }

  const lineItems: BillingLineItemRow[] = []
  const payments: BillingPaymentRow[] = []

  for (const chunk of chunkValues(scheduleIds, SCHEDULE_ID_CHUNK_SIZE)) {
    const [lineItemsResult, paymentsResult] = await Promise.all([
      supabaseAdmin
        .from('billing_line_items')
        .select('id, client_id, schedule_id, amount, created_at')
        .eq('company_id', companyId)
        .in('schedule_id', chunk),
      supabaseAdmin
        .from('billing_payments')
        .select('id, client_id, schedule_id, amount, payment_date, source')
        .eq('company_id', companyId)
        .in('schedule_id', chunk),
    ])

    if (lineItemsResult.error) throw lineItemsResult.error
    if (paymentsResult.error) throw paymentsResult.error

    lineItems.push(...(lineItemsResult.data || []))
    payments.push(...(paymentsResult.data || []))
  }

  return { lineItems, payments }
}

export async function fetchScheduleStatusCounts(
  supabaseAdmin: SupabaseClient,
  clientIds: string[]
): Promise<ScheduleStatusCount[]> {
  if (clientIds.length === 0) return []

  const statuses = ['scheduled', 'in_progress', 'archived', 'cancelled'] as const
  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabaseAdmin
        .from('schedules')
        .select('id', { count: 'exact', head: true })
        .in('client_id', clientIds)
        .eq('status', status)

      if (error) throw error
      return { status, count: count || 0 }
    })
  )

  return counts.filter((entry) => entry.count > 0)
}

const REPORTS_SCHEDULE_SELECT =
  'id, client_id, title, status, start_time, end_time, price, recurring_rule_id, occurrence_origin_start'

export async function fetchReportsBillingBundle(input: {
  supabaseAdmin: SupabaseClient
  companyId: string
  clientIds: string[]
  period: ReportsPeriod
  timezone: string
  now?: Date
}): Promise<{
  schedules: ReportsScheduleRow[]
  lineItems: BillingLineItemRow[]
  payments: BillingPaymentRow[]
  invoiceDocuments: Array<{ schedule_id: string; id: string; created_at: string }>
  scheduleStatusCounts: ScheduleStatusCount[]
}> {
  const now = input.now ?? new Date()
  const bounds = getReportsPeriodBounds(input.period, input.timezone, now)

  if (input.clientIds.length === 0) {
    return {
      schedules: [],
      lineItems: [],
      payments: [],
      invoiceDocuments: [],
      scheduleStatusCounts: [],
    }
  }

  const scheduleStatusCounts = await fetchScheduleStatusCounts(
    input.supabaseAdmin,
    input.clientIds
  )

  const openSchedulesPromise = input.supabaseAdmin
    .from('schedules')
    .select(REPORTS_SCHEDULE_SELECT)
    .in('client_id', input.clientIds)
    .in('status', ['scheduled', 'in_progress'])

  let periodArchivedQuery = input.supabaseAdmin
    .from('schedules')
    .select(REPORTS_SCHEDULE_SELECT)
    .in('client_id', input.clientIds)
    .eq('status', 'archived')

  if (bounds.start) {
    periodArchivedQuery = periodArchivedQuery
      .gte('end_time', bounds.start.toISOString())
      .lte('end_time', bounds.end.toISOString())
  }

  const billedScheduleIdsPromise = input.supabaseAdmin
    .from('billing_line_items')
    .select('schedule_id')
    .eq('company_id', input.companyId)

  const [{ data: openSchedules, error: openError }, { data: periodArchived, error: archivedError }, { data: billedRefs, error: billedError }] =
    await Promise.all([openSchedulesPromise, periodArchivedQuery, billedScheduleIdsPromise])

  if (openError) throw openError
  if (archivedError) throw archivedError
  if (billedError) throw billedError

  const billedScheduleIds = [
    ...new Set((billedRefs || []).map((row) => row.schedule_id).filter(Boolean)),
  ]

  let billedSchedules: ReportsScheduleRow[] = []
  if (billedScheduleIds.length > 0) {
    for (const chunk of chunkValues(billedScheduleIds, SCHEDULE_ID_CHUNK_SIZE)) {
      const { data, error } = await input.supabaseAdmin
        .from('schedules')
        .select(REPORTS_SCHEDULE_SELECT)
        .in('id', chunk)
        .in('client_id', input.clientIds)
        .neq('status', 'cancelled')

      if (error) throw error
      billedSchedules.push(...((data || []) as ReportsScheduleRow[]))
    }
  }

  const schedules = uniqueById([
    ...((openSchedules || []) as ReportsScheduleRow[]),
    ...((periodArchived || []) as ReportsScheduleRow[]),
    ...billedSchedules,
  ])

  const scheduleIds = schedules.map((schedule) => schedule.id)
  const { lineItems, payments } = await fetchBillingRowsForScheduleIds(
    input.supabaseAdmin,
    input.companyId,
    scheduleIds
  )

  let invoiceDocuments: Array<{ schedule_id: string; id: string; created_at: string }> = []
  if (scheduleIds.length > 0) {
    for (const chunk of chunkValues(scheduleIds, SCHEDULE_ID_CHUNK_SIZE)) {
      const { data, error } = await input.supabaseAdmin
        .from('client_documents')
        .select('id, schedule_id, created_at')
        .eq('company_id', input.companyId)
        .eq('source', 'invoice')
        .in('schedule_id', chunk)

      if (error && error.code !== '42703') throw error
      if (!error) {
        invoiceDocuments.push(...(data || []))
      }
    }
  }

  return {
    schedules,
    lineItems,
    payments,
    invoiceDocuments,
    scheduleStatusCounts,
  }
}

export async function fetchMtdDashboardSchedules(input: {
  supabaseAdmin: SupabaseClient
  clientIds: string[]
  timezone: string
  now?: Date
}): Promise<ReportsScheduleRow[]> {
  if (input.clientIds.length === 0) return []

  const now = input.now ?? new Date()
  const bounds = getReportsPeriodBounds('mtd', input.timezone, now)
  const monthStartIso = bounds.start?.toISOString()
  const monthEndIso = bounds.end.toISOString()

  const [overlapResult, recurringResult] = await Promise.all([
    input.supabaseAdmin
      .from('schedules')
      .select(REPORTS_SCHEDULE_SELECT)
      .in('client_id', input.clientIds)
      .neq('status', 'cancelled')
      .lt('start_time', monthEndIso)
      .gt('end_time', monthStartIso || '1970-01-01T00:00:00.000Z'),
    input.supabaseAdmin
      .from('schedules')
      .select(REPORTS_SCHEDULE_SELECT)
      .in('client_id', input.clientIds)
      .in('status', ['scheduled', 'in_progress'])
      .not('recurring_rule_id', 'is', null),
  ])

  if (overlapResult.error) throw overlapResult.error
  if (recurringResult.error) throw recurringResult.error

  return uniqueById([
    ...((overlapResult.data || []) as ReportsScheduleRow[]),
    ...((recurringResult.data || []) as ReportsScheduleRow[]),
  ])
}

function applyPaymentSourceFilter<T extends { source?: string | null }>(
  query: any,
  source: PaymentsFilterSource
) {
  if (source === 'stripe') return query.eq('source', 'stripe')
  if (source === 'manual') return query.neq('source', 'stripe')
  return query
}

function applyPaymentPeriodFilter(
  query: any,
  bounds: ReturnType<typeof getReportsPeriodBounds>
) {
  if (!bounds.start) return query
  return query
    .gte('payment_date', toPaymentDateIso(bounds.start))
    .lte('payment_date', toPaymentDateIso(bounds.end))
}

export async function fetchCompanyPaymentsPage(input: {
  supabaseAdmin: SupabaseClient
  companyId: string
  bounds: ReturnType<typeof getReportsPeriodBounds>
  source: PaymentsFilterSource
  search?: string
  page?: number
  pageSize?: number
}): Promise<{
  payments: any[]
  total: number
}> {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? DEFAULT_PAYMENTS_PAGE_SIZE))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const search = input.search?.trim()

  let query = input.supabaseAdmin
    .from('billing_payments')
    .select(
      `
        id,
        schedule_id,
        client_id,
        company_id,
        amount,
        payment_date,
        method,
        notes,
        source,
        stripe_payment_intent_id,
        created_at,
        schedule:schedules!schedule_id (title, status),
        client:clients!client_id (name)
      `,
      { count: 'exact' }
    )
    .eq('company_id', input.companyId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })

  query = applyPaymentPeriodFilter(query, input.bounds)
  query = applyPaymentSourceFilter(query, input.source)

  if (search) {
    const pattern = `%${search}%`
    query = query.or(
      `method.ilike.${pattern},notes.ilike.${pattern},client.name.ilike.${pattern},schedule.title.ilike.${pattern}`
    )
  }

  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) throw error

  return {
    payments: data || [],
    total: count || 0,
  }
}

export async function fetchCompanyPaymentsSummary(input: {
  supabaseAdmin: SupabaseClient
  companyId: string
  bounds: ReturnType<typeof getReportsPeriodBounds>
  source: PaymentsFilterSource
  search?: string
}) {
  const search = input.search?.trim()

  let query = input.supabaseAdmin
    .from('billing_payments')
    .select(
      `
        amount,
        source,
        method,
        notes,
        client:clients!client_id (name),
        schedule:schedules!schedule_id (title)
      `
    )
    .eq('company_id', input.companyId)

  query = applyPaymentPeriodFilter(query, input.bounds)
  query = applyPaymentSourceFilter(query, input.source)

  if (search) {
    const pattern = `%${search}%`
    query = query.or(
      `method.ilike.${pattern},notes.ilike.${pattern},client.name.ilike.${pattern},schedule.title.ilike.${pattern}`
    )
  }

  const { data, error } = await query
  if (error) throw error

  return summarizePayments(data || [])
}

export function mapPaymentRow(payment: any) {
  const schedule = Array.isArray(payment.schedule) ? payment.schedule[0] : payment.schedule
  const client = Array.isArray(payment.client) ? payment.client[0] : payment.client

  return {
    id: payment.id,
    scheduleId: payment.schedule_id,
    clientId: payment.client_id,
    companyId: payment.company_id,
    amount: Number(payment.amount),
    paymentDate: payment.payment_date,
    method: payment.method,
    notes: payment.notes,
    source: (payment.source === 'stripe' ? 'stripe' : 'manual') as 'manual' | 'stripe',
    stripePaymentIntentId: payment.stripe_payment_intent_id,
    createdAt: payment.created_at,
    clientName: client?.name || 'Unknown client',
    jobTitle: schedule?.title || 'Job',
    jobStatus: schedule?.status || 'unknown',
  }
}