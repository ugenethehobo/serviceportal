import { formatCurrency } from '@/lib/billing'
import { isJobBillableForClient, type PortalJob } from '@/lib/portal-jobs'

export type PortalActivityType =
  | 'estimate_review'
  | 'contract_signing'
  | 'contract_signed'
  | 'payment_due'
  | 'payment_received'
  | 'visit_upcoming'

export type PortalActivityItem = {
  id: string
  type: PortalActivityType
  title: string
  description: string
  href: string
  occurredAt: string
  urgent?: boolean
}

type RawEstimate = {
  id: string
  title: string
  total: number
  status: string
  updated_at: string
}

type RawContract = {
  id: string
  title: string
  status: string
  sent_at: string | null
  updated_at: string
  client_signed_at: string | null
}

type RawPayment = {
  id: string
  schedule_id: string
  amount: number
  payment_date: string
  created_at: string
  source?: string | null
}

type RawLineItem = {
  schedule_id: string
  created_at: string
}

type ScheduleMeta = {
  id: string
  title: string
  status: string
  start_time: string
}

export type PortalActivityPeriod = '1w' | '2w' | '30d' | '60d' | 'all'

export const PORTAL_ACTIVITY_PERIOD_LABELS: Record<PortalActivityPeriod, string> = {
  '1w': '1 week',
  '2w': '2 weeks',
  '30d': '30 days',
  '60d': '60 days',
  all: 'All time',
}

const PERIOD_DAYS: Record<Exclude<PortalActivityPeriod, 'all'>, number> = {
  '1w': 7,
  '2w': 14,
  '30d': 30,
  '60d': 60,
}

function daysAgoIso(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

function formatActivityWhen(iso: string, timezone: string) {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) {
    return date.toLocaleDateString([], { timeZone: timezone, weekday: 'short' })
  }
  return date.toLocaleDateString([], {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
  })
}

export function buildPortalActivity(input: {
  timezone: string
  estimates: RawEstimate[]
  contracts?: RawContract[]
  jobs: PortalJob[]
  payments: RawPayment[]
  lineItems: RawLineItem[]
  schedulesById: Map<string, ScheduleMeta>
  now?: Date
  limit?: number
}): PortalActivityItem[] {
  const now = input.now ?? new Date()
  const items: PortalActivityItem[] = []

  for (const contract of input.contracts || []) {
    if (contract.status === 'ready_for_signing') {
      items.push({
        id: `contract-sign-${contract.id}`,
        type: 'contract_signing',
        title: 'Contract ready for signing',
        description: contract.title,
        href: `/portal/contracts/${contract.id}`,
        occurredAt: contract.sent_at || contract.updated_at,
        urgent: true,
      })
      continue
    }

    if (contract.status === 'signed' && contract.client_signed_at) {
      items.push({
        id: `contract-signed-${contract.id}`,
        type: 'contract_signed',
        title: 'Contract signed',
        description: contract.title,
        href: `/portal/contracts/${contract.id}`,
        occurredAt: contract.client_signed_at,
      })
    }
  }

  for (const estimate of input.estimates) {
    if (estimate.status !== 'sent') continue
    items.push({
      id: `estimate-${estimate.id}`,
      type: 'estimate_review',
      title: 'Estimate needs your review',
      description: `${estimate.title} — ${formatCurrency(Number(estimate.total))}`,
      href: '/portal/estimates',
      occurredAt: estimate.updated_at,
      urgent: true,
    })
  }

  const latestLineBySchedule = new Map<string, string>()
  for (const line of input.lineItems) {
    const prev = latestLineBySchedule.get(line.schedule_id)
    if (!prev || line.created_at > prev) {
      latestLineBySchedule.set(line.schedule_id, line.created_at)
    }
  }

  for (const job of input.jobs) {
    if (!job.canPay || job.balanceDue <= 0) continue
    if (!isJobBillableForClient(job, now)) continue

    const lineAt = latestLineBySchedule.get(job.id)
    items.push({
      id: `payment-due-${job.id}`,
      type: 'payment_due',
      title: 'Balance due',
      description: `${job.title} — ${job.balanceDueFormatted}`,
      href: `/portal/jobs/${job.id}?pay=1`,
      occurredAt: lineAt || job.endTime,
      urgent: true,
    })
  }

  for (const payment of input.payments) {
    const schedule = input.schedulesById.get(payment.schedule_id)
    const jobTitle = schedule?.title || 'Job'
    items.push({
      id: `payment-${payment.id}`,
      type: 'payment_received',
      title: payment.source === 'stripe' ? 'Online payment received' : 'Payment recorded',
      description: `${jobTitle} — ${formatCurrency(Number(payment.amount))}`,
      href: `/portal/jobs/${payment.schedule_id}`,
      occurredAt: payment.created_at,
    })
  }

  for (const job of input.jobs) {
    if (job.status === 'cancelled' || job.status === 'archived') continue
    if (!isJobBillableForClient(job, now) && new Date(job.startTime).getTime() > now.getTime()) {
      const hoursUntil =
        (new Date(job.startTime).getTime() - now.getTime()) / (1000 * 60 * 60)
      if (hoursUntil <= 72) {
        items.push({
          id: `visit-${job.id}`,
          type: 'visit_upcoming',
          title: 'Upcoming visit',
          description: `${job.title} — ${job.crew?.name || 'Crew TBD'}`,
          href: `/portal/jobs/${job.id}`,
          occurredAt: job.startTime,
        })
      }
    }
  }

  return items
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, input.limit ?? 50)
}

export function filterActivityByPeriod(
  items: PortalActivityItem[],
  period: PortalActivityPeriod,
  now = new Date()
) {
  if (period === 'all') return items

  const days = PERIOD_DAYS[period]
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - days)

  return items.filter((item) => {
    if (item.urgent) return true
    return new Date(item.occurredAt).getTime() >= cutoff.getTime()
  })
}

export function formatPortalActivityWhen(iso: string, timezone: string) {
  return formatActivityWhen(iso, timezone)
}