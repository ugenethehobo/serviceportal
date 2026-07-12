import {
  occurrenceTimesMatch,
  projectRecurringOccurrences,
  type RecurringRule,
} from '@/lib/recurring-schedule-projection'
import { getReportsPeriodBounds } from '@/lib/reports'
import type { RecurringSeriesAnchor } from '@/lib/schedule-calendar'
import { getCompanyDateString, parseAsCompanyTime } from '@/lib/timezone'

export type MtdScheduleRow = {
  id: string
  status: string
  start_time: string
  end_time: string
  recurring_rule_id?: string | null
  occurrence_origin_start?: string | null
}

export type MtdPaymentRow = {
  amount: number
  payment_date: string
  source?: 'manual' | 'stripe' | null
}

export type MtdJobCounts = {
  completed: number
  open: number
}

type PeriodBounds = {
  start: Date | null
  end: Date
}

export function getCalendarMonthBounds(timezone: string, now = new Date()): PeriodBounds {
  const today = getCompanyDateString(timezone, now)
  const monthStart = `${today.slice(0, 7)}-01`
  const start = new Date(parseAsCompanyTime(`${monthStart}T00:00`, timezone))
  const [year, month] = today.slice(0, 7).split('-').map(Number)
  const nextMonthStart =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`
  const end = new Date(parseAsCompanyTime(`${nextMonthStart}T00:00`, timezone))
  end.setMilliseconds(end.getMilliseconds() - 1)
  return { start, end }
}

function occurrenceOverlapsBounds(
  occurrenceStart: string,
  occurrenceEnd: string,
  bounds: PeriodBounds
): boolean {
  const startMs = new Date(occurrenceStart).getTime()
  const endMs = new Date(occurrenceEnd).getTime()
  const boundStartMs = bounds.start?.getTime() ?? 0
  const boundEndMs = bounds.end.getTime()
  return startMs <= boundEndMs && endMs >= boundStartMs
}

function scheduleCoversOccurrence(
  schedule: MtdScheduleRow,
  occurrenceStartIso: string
): boolean {
  if (schedule.occurrence_origin_start) {
    return occurrenceTimesMatch(schedule.occurrence_origin_start, occurrenceStartIso)
  }

  return occurrenceTimesMatch(schedule.start_time, occurrenceStartIso)
}

function recurringOccurrenceKey(ruleId: string, occurrenceStartIso: string) {
  return `recurring:${ruleId}:${new Date(occurrenceStartIso).getTime()}`
}

function oneOffOccurrenceKey(scheduleId: string) {
  return `oneoff:${scheduleId}`
}

function classifyOccurrence(
  status: string,
  occurrenceEnd: string,
  now: Date
): 'completed' | 'open' | 'skip' {
  if (status === 'cancelled') return 'skip'

  const endMs = new Date(occurrenceEnd).getTime()
  const nowMs = now.getTime()

  if (status === 'archived' || endMs < nowMs) return 'completed'
  if (status === 'scheduled' || status === 'in_progress') return 'open'
  return 'skip'
}

export function countMtdJobOccurrences(input: {
  schedules: MtdScheduleRow[]
  recurringSeries: RecurringSeriesAnchor[]
  timezone: string
  now?: Date
}): MtdJobCounts {
  const now = input.now ?? new Date()
  const bounds = getCalendarMonthBounds(input.timezone, now)
  const seen = new Set<string>()
  let completed = 0
  let open = 0

  const schedulesByRule = new Map<string, MtdScheduleRow[]>()
  for (const schedule of input.schedules) {
    if (!schedule.recurring_rule_id) continue
    const list = schedulesByRule.get(schedule.recurring_rule_id) ?? []
    list.push(schedule)
    schedulesByRule.set(schedule.recurring_rule_id, list)
  }

  for (const schedule of input.schedules) {
    const occurrenceStart = schedule.occurrence_origin_start ?? schedule.start_time
    if (!occurrenceOverlapsBounds(occurrenceStart, schedule.end_time, bounds)) continue

    const key = schedule.recurring_rule_id
      ? recurringOccurrenceKey(schedule.recurring_rule_id, occurrenceStart)
      : oneOffOccurrenceKey(schedule.id)

    if (seen.has(key)) continue

    const bucket = classifyOccurrence(schedule.status, schedule.end_time, now)
    if (bucket === 'skip') continue

    seen.add(key)
    if (bucket === 'completed') completed++
    else open++
  }

  for (const series of input.recurringSeries) {
    const ruleId = series.schedule.recurring_rule_id
    if (!ruleId) continue

    const durationMs =
      new Date(series.schedule.end_time).getTime() -
      new Date(series.schedule.start_time).getTime()
    const rangeStart = bounds.start ?? new Date(0)
    const rangeEnd = bounds.end

    const occurrences = projectRecurringOccurrences(
      new Date(series.schedule.start_time),
      durationMs,
      series.rule as RecurringRule,
      rangeStart,
      rangeEnd
    )
    const ruleSchedules = schedulesByRule.get(ruleId) ?? []

    for (const occurrence of occurrences) {
      const occurrenceStart = occurrence.start.toISOString()
      const occurrenceEnd = occurrence.end.toISOString()
      const key = recurringOccurrenceKey(ruleId, occurrenceStart)

      if (seen.has(key)) continue

      const coveredBySchedule = ruleSchedules.some((schedule) =>
        scheduleCoversOccurrence(schedule, occurrenceStart)
      )
      if (coveredBySchedule) continue

      const bucket = classifyOccurrence('scheduled', occurrenceEnd, now)
      if (bucket === 'skip') continue

      seen.add(key)
      if (bucket === 'completed') completed++
      else open++
    }
  }

  return { completed, open }
}

function paymentsInMtdBounds(
  payments: MtdPaymentRow[],
  timezone: string,
  now: Date,
  source?: 'manual' | 'stripe'
) {
  const bounds = getReportsPeriodBounds('mtd', timezone, now)
  const boundStartMs = bounds.start?.getTime() ?? 0
  const boundEndMs = bounds.end.getTime()

  return payments.filter((payment) => {
    if (source && payment.source !== source) return false
    const time = new Date(payment.payment_date).getTime()
    return time >= boundStartMs && time <= boundEndMs
  })
}

export function sumRecordedPaymentsInPeriod(
  payments: MtdPaymentRow[],
  timezone: string,
  now = new Date()
): number {
  return paymentsInMtdBounds(payments, timezone, now).reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  )
}

export function sumRecordedStripePaymentsInPeriod(
  payments: MtdPaymentRow[],
  timezone: string,
  now = new Date()
): number {
  return paymentsInMtdBounds(payments, timezone, now, 'stripe').reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  )
}