import { formatCurrency } from '@/lib/billing'
import { getCompanyDateString, parseAsCompanyTime } from '@/lib/timezone'

export type ReportsPeriod = '30d' | '90d' | 'ytd' | 'all'

export const REPORTS_PERIOD_LABELS: Record<ReportsPeriod, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
  all: 'All time',
}

export type ReportsSummary = {
  totalBilled: number
  totalCollected: number
  balanceDue: number
  jobsCompleted: number
  jobsScheduled: number
  activeClients: number
  leadsConverted: number
  estimatesSent: number
}

export type RevenueMonthPoint = {
  monthKey: string
  monthLabel: string
  billed: number
  collected: number
}

export type JobStatusPoint = {
  status: string
  label: string
  count: number
}

export type ClientBalanceRow = {
  clientId: string
  clientName: string
  totalBilled: number
  totalCollected: number
  balanceDue: number
}

export type ReportsData = {
  period: ReportsPeriod
  periodLabel: string
  timezone: string
  summary: ReportsSummary
  revenueByMonth: RevenueMonthPoint[]
  jobsByStatus: JobStatusPoint[]
  outstandingClients: ClientBalanceRow[]
}

type RawLineItem = {
  id: string
  client_id: string
  schedule_id: string
  amount: number
  created_at: string
}

type RawPayment = {
  id: string
  client_id: string
  schedule_id: string
  amount: number
  payment_date: string
}

type RawSchedule = {
  id: string
  client_id: string
  status: string
  start_time: string
  end_time: string
  price?: number | null
  recurring_rule_id?: string | null
}

const OPEN_JOB_STATUSES = new Set(['scheduled', 'in_progress'])

type RawClient = {
  id: string
  name: string
  status: string
}

type PeriodBounds = {
  start: Date | null
  end: Date
}

const JOB_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  archived: 'Completed',
  cancelled: 'Cancelled',
}

function shiftCompanyDateString(dateStr: string, timezone: string, dayOffset: number) {
  const anchorIso = parseAsCompanyTime(`${dateStr}T12:00`, timezone)
  const shifted = new Date(anchorIso)
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset)
  return getCompanyDateString(timezone, shifted)
}

/** Inclusive window [start, end]. When start is null (all time), only caps at end (now). */
export function getReportsPeriodBounds(
  period: ReportsPeriod,
  timezone: string,
  now = new Date()
): PeriodBounds {
  const end = now

  if (period === 'all') {
    return { start: null, end }
  }

  const today = getCompanyDateString(timezone, now)

  if (period === '30d' || period === '90d') {
    const days = period === '30d' ? 30 : 90
    const startDateStr = shiftCompanyDateString(today, timezone, -days)
    const start = new Date(parseAsCompanyTime(`${startDateStr}T00:00`, timezone))
    return { start, end }
  }

  const year = today.slice(0, 4)
  const start = new Date(parseAsCompanyTime(`${year}-01-01T00:00`, timezone))
  return { start, end }
}

/** @deprecated Use getReportsPeriodBounds — kept for leads/estimates queries in action.ts */
export function getReportsPeriodStart(
  period: ReportsPeriod,
  timezone: string,
  now = new Date()
): Date | null {
  return getReportsPeriodBounds(period, timezone, now).start
}

export function isInReportsPeriod(iso: string, bounds: PeriodBounds) {
  const time = new Date(iso).getTime()
  if (time > bounds.end.getTime()) return false
  if (bounds.start && time < bounds.start.getTime()) return false
  return true
}

function monthKeyFromIso(iso: string, timezone: string) {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).format(date)
}

function monthLabelFromKey(monthKey: string) {
  const [year, month] = monthKey.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/**
 * Completed-job revenue uses list price (same source as Amount Due on clients).
 * Line items are ignored here because recurring copies can duplicate them.
 */
export function getCompletedJobBilledAmount(schedule: Pick<RawSchedule, 'price'>) {
  return Number(schedule.price) || 0
}

/** Matches the Amount Due column on the clients list (open job list prices). */
export function computeOpenJobsAmountDue(
  schedules: Array<Pick<RawSchedule, 'client_id' | 'status' | 'price'>>
) {
  const byClient = new Map<string, number>()
  let total = 0

  for (const schedule of schedules) {
    if (!OPEN_JOB_STATUSES.has(schedule.status)) continue
    const amount = Number(schedule.price) || 0
    if (amount <= 0) continue
    total += amount
    byClient.set(schedule.client_id, (byClient.get(schedule.client_id) || 0) + amount)
  }

  return { total, byClient }
}

function isCompletedJobInPeriod(schedule: RawSchedule, bounds: PeriodBounds) {
  if (schedule.status !== 'archived') return false
  return isInReportsPeriod(schedule.end_time, bounds)
}

export function buildReportsData(input: {
  period: ReportsPeriod
  timezone: string
  lineItems: RawLineItem[]
  payments: RawPayment[]
  schedules: RawSchedule[]
  clients: RawClient[]
  leadsConverted: number
  estimatesSent: number
  now?: Date
}): ReportsData {
  const now = input.now ?? new Date()
  const bounds = getReportsPeriodBounds(input.period, input.timezone, now)
  const scheduleById = new Map(input.schedules.map((schedule) => [schedule.id, schedule]))

  const completedJobsInPeriod = input.schedules.filter((schedule) =>
    isCompletedJobInPeriod(schedule, bounds)
  )

  const periodPayments = input.payments.filter((payment) => {
    const schedule = scheduleById.get(payment.schedule_id)
    if (!schedule || schedule.status === 'cancelled') return false
    return isInReportsPeriod(payment.payment_date, bounds)
  })

  const { total: balanceDue, byClient: openAmountByClient } = computeOpenJobsAmountDue(
    input.schedules
  )

  const jobsCompleted = completedJobsInPeriod.length

  const jobsScheduled = input.schedules.filter(
    (schedule) =>
      schedule.status === 'scheduled' || schedule.status === 'in_progress'
  ).length

  const activeClients = input.clients.filter((client) => client.status === 'active').length

  const monthTotals = new Map<string, { billed: number; collected: number }>()
  const ensureMonth = (key: string) => {
    if (!monthTotals.has(key)) {
      monthTotals.set(key, { billed: 0, collected: 0 })
    }
    return monthTotals.get(key)!
  }

  let totalBilled = 0
  for (const schedule of completedJobsInPeriod) {
    const amount = getCompletedJobBilledAmount(schedule)
    if (amount <= 0) continue
    totalBilled += amount
    const key = monthKeyFromIso(schedule.end_time, input.timezone)
    ensureMonth(key).billed += amount
  }

  for (const payment of periodPayments) {
    const key = monthKeyFromIso(payment.payment_date, input.timezone)
    ensureMonth(key).collected += Number(payment.amount)
  }

  const periodStartKey = bounds.start
    ? monthKeyFromIso(bounds.start.toISOString(), input.timezone)
    : null
  const periodEndKey = monthKeyFromIso(bounds.end.toISOString(), input.timezone)

  const revenueByMonth = Array.from(monthTotals.entries())
    .filter(([monthKey]) => {
      if (!periodStartKey) return monthKey <= periodEndKey
      return monthKey >= periodStartKey && monthKey <= periodEndKey
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, totals]) => ({
      monthKey,
      monthLabel: monthLabelFromKey(monthKey),
      billed: Math.round(totals.billed * 100) / 100,
      collected: Math.round(totals.collected * 100) / 100,
    }))

  const statusCounts = new Map<string, number>()
  for (const schedule of input.schedules) {
    statusCounts.set(schedule.status, (statusCounts.get(schedule.status) || 0) + 1)
  }

  const jobsByStatus = Array.from(statusCounts.entries())
    .map(([status, count]) => ({
      status,
      label: JOB_STATUS_LABELS[status] || status,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  const clientNameById = new Map(input.clients.map((client) => [client.id, client.name]))
  const outstandingClients = Array.from(openAmountByClient.entries())
    .map(([clientId, amountDue]) => ({
      clientId,
      clientName: clientNameById.get(clientId) || 'Unknown client',
      totalBilled: amountDue,
      totalCollected: 0,
      balanceDue: amountDue,
    }))
    .filter((row) => row.balanceDue > 0)
    .sort((a, b) => b.balanceDue - a.balanceDue)
    .slice(0, 10)

  return {
    period: input.period,
    periodLabel: REPORTS_PERIOD_LABELS[input.period],
    timezone: input.timezone,
    summary: {
      totalBilled,
      totalCollected: periodPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
      balanceDue,
      jobsCompleted,
      jobsScheduled,
      activeClients,
      leadsConverted: input.leadsConverted,
      estimatesSent: input.estimatesSent,
    },
    revenueByMonth,
    jobsByStatus,
    outstandingClients,
  }
}

export function formatReportsCurrency(amount: number) {
  return formatCurrency(amount)
}