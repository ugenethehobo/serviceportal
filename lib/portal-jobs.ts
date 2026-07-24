import { formatCurrency, type BillingSummary } from '@/lib/billing'
import {
  computeCanPay,
  computeImplicitFullBalancePayable,
  type JobPaymentPlanType,
  type PlanProgressSummary,
} from '@/lib/payment-plans'
import { formatTimeInTimezone } from '@/lib/timezone'

export type PortalJobInstallment = {
  id: string
  key: string
  label: string
  remaining: number
  remainingFormatted: string
  amountDue: number
  amountDueFormatted: string
  amountPaid: number
  collectibleNow: boolean
  status: string
}

/** Prefer next collectible installment label for portal copy (activity, billing rows). */
export function portalDueNowLabel(job: {
  amountDueNow: number
  nextInstallmentLabel?: string | null
  installments?: Array<{
    label: string
    remaining: number
    collectibleNow: boolean
    status: string
  }>
}): string | null {
  if (job.amountDueNow <= 0) return null
  if (job.nextInstallmentLabel?.trim()) return job.nextInstallmentLabel.trim()
  const next = (job.installments || []).find(
    (i) =>
      i.status !== 'superseded' &&
      i.collectibleNow &&
      i.remaining > 0
  )
  return next?.label?.trim() || null
}

export type PortalCrewMember = {
  id: string
  fullName: string
  avatarUrl: string | null
  isLead: boolean
}

export type PortalJobCrew = {
  id: string
  name: string
  leadId?: string | null
  members?: PortalCrewMember[]
} | null

export type PortalJobSchedule = {
  id: string
  title: string
  description: string | null
  startTime: string
  endTime: string
  status: string
  price: number
  crew: PortalJobCrew
  serviceAddress: string
}

/** Account-level billing summary for the portal home Billing column. */
export type PortalBillingOverview = {
  totalCharged: number
  totalChargedFormatted: string
  totalPaid: number
  totalPaidFormatted: string
  /** Full ledger outstanding across visits. */
  balanceDue: number
  balanceDueFormatted: string
  /** Collectible now across visits (payment-plan aware). */
  amountDueNow: number
  amountDueNowFormatted: string
  jobs: Array<{
    id: string
    title: string
    startTime: string
    status: string
    totalCharged: number
    totalChargedFormatted: string
    totalPaid: number
    totalPaidFormatted: string
    balanceDue: number
    balanceDueFormatted: string
    canPay: boolean
    amountDueNow: number
    amountDueNowFormatted: string
    planType: JobPaymentPlanType | null
    hasPaymentPlan: boolean
    nextInstallmentLabel: string | null
    /** Primary amount shown in the list (due now when collectible, else remaining). */
    displayAmount: number
    displayAmountFormatted: string
    displayAmountKind: 'due_now' | 'outstanding' | 'billed' | 'paid'
    installments: PortalJobInstallment[]
  }>
  recentPayments: Array<{
    id: string
    amount: number
    amountFormatted: string
    paymentDate: string
    scheduleId: string
    jobTitle: string
    source: string | null
  }>
}

export function buildPortalBillingOverview(
  jobs: PortalJob[],
  payments: Array<{
    id: string
    schedule_id: string
    amount: number
    payment_date: string
    source?: string | null
  }>,
  schedulesById: Map<string, { id: string; title: string }>
): PortalBillingOverview {
  const billedJobs = jobs
    .filter((job) => job.totalCharged > 0 || job.totalPaid > 0)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())

  const totalCharged = billedJobs.reduce((sum, job) => sum + job.totalCharged, 0)
  const totalPaid = billedJobs.reduce((sum, job) => sum + job.totalPaid, 0)
  const balanceDue = billedJobs.reduce((sum, job) => sum + job.balanceDue, 0)
  const amountDueNow = billedJobs.reduce((sum, job) => sum + Math.max(0, job.amountDueNow), 0)

  const recentPayments = [...payments]
    .sort((a, b) => {
      if (a.payment_date !== b.payment_date) {
        return a.payment_date < b.payment_date ? 1 : -1
      }
      return a.id < b.id ? 1 : -1
    })
    .slice(0, 8)
    .map((payment) => {
      const schedule = schedulesById.get(payment.schedule_id)
      return {
        id: payment.id,
        amount: Number(payment.amount) || 0,
        amountFormatted: formatCurrency(Number(payment.amount) || 0),
        paymentDate: payment.payment_date,
        scheduleId: payment.schedule_id,
        jobTitle: schedule?.title || 'Visit',
        source: payment.source ?? null,
      }
    })

  return {
    totalCharged,
    totalChargedFormatted: formatCurrency(totalCharged),
    totalPaid,
    totalPaidFormatted: formatCurrency(totalPaid),
    balanceDue,
    balanceDueFormatted: formatCurrency(balanceDue),
    amountDueNow,
    amountDueNowFormatted: formatCurrency(amountDueNow),
    jobs: billedJobs.map((job) => {
      const installments = job.installments || []
      const hasPaymentPlan =
        Boolean(job.planType && job.planType !== 'full_balance') || installments.length > 0
      const nextLabel = portalDueNowLabel(job)
      let displayAmountKind: 'due_now' | 'outstanding' | 'billed' | 'paid' = 'billed'
      let displayAmount = job.totalCharged
      if (job.amountDueNow > 0) {
        displayAmountKind = 'due_now'
        displayAmount = job.amountDueNow
      } else if (job.balanceDue > 0) {
        displayAmountKind = 'outstanding'
        displayAmount = job.balanceDue
      } else if (job.totalPaid > 0 && job.balanceDue <= 0) {
        displayAmountKind = 'paid'
        displayAmount = job.totalPaid
      }

      return {
        id: job.id,
        title: job.title,
        startTime: job.startTime,
        status: job.status,
        totalCharged: job.totalCharged,
        totalChargedFormatted: formatCurrency(job.totalCharged),
        totalPaid: job.totalPaid,
        totalPaidFormatted: formatCurrency(job.totalPaid),
        balanceDue: job.balanceDue,
        balanceDueFormatted: formatCurrency(job.balanceDue),
        canPay: job.canPay,
        amountDueNow: job.amountDueNow,
        amountDueNowFormatted: job.amountDueNowFormatted,
        planType: job.planType ?? null,
        hasPaymentPlan,
        nextInstallmentLabel: nextLabel,
        displayAmount,
        displayAmountFormatted: formatCurrency(displayAmount),
        displayAmountKind,
        installments,
      }
    }),
    recentPayments,
  }
}

export type PortalJobBilling = {
  /** Always ledger totalCharged − totalPaid (never zeroed for collectibility). */
  balanceDue: number
  balanceDueFormatted: string
  /** Collectible now (drives Pay CTAs). */
  amountDueNow: number
  amountDueNowFormatted: string
  maxPayableNow: number
  canPay: boolean
  isPaid: boolean
  totalCharged: number
  totalPaid: number
  isBillable: boolean
  lockPortalToDueNow?: boolean
  allowPayAhead?: boolean
  planType?: JobPaymentPlanType | null
  nextInstallmentLabel?: string | null
  /** Open installments for portal chips / billing overview. */
  installments?: PortalJobInstallment[]
}

export type PortalJob = PortalJobSchedule & PortalJobBilling

/**
 * Map ledger summary + billable gate into portal billing fields.
 * When `plan` is provided, amountDueNow / maxPayableNow / canPay come from the plan.
 */
export function buildPortalJobBillingFields(
  summary: BillingSummary,
  lineItemCount: number,
  billable: boolean,
  plan?: PlanProgressSummary | null
): PortalJobBilling {
  if (plan) {
    const canPay = computeCanPay({
      balanceDue: summary.balanceDue,
      lineItemCount,
      billable,
      plan: {
        allowPayAhead: plan.allowPayAhead,
        amountDueNow: plan.amountDueNow,
        hasCollectibleNow: plan.hasCollectibleNow,
      },
    })
    return {
      balanceDue: summary.balanceDue,
      balanceDueFormatted: formatCurrency(summary.balanceDue),
      amountDueNow: plan.amountDueNow,
      amountDueNowFormatted: formatCurrency(plan.amountDueNow),
      maxPayableNow: plan.maxPayableNow,
      canPay,
      isPaid: lineItemCount > 0 && summary.balanceDue <= 0,
      totalCharged: summary.totalCharged,
      totalPaid: summary.totalPaid,
      isBillable: billable,
      lockPortalToDueNow: plan.lockPortalToDueNow,
      allowPayAhead: plan.allowPayAhead,
      planType: plan.planType,
      nextInstallmentLabel: plan.nextInstallment?.label ?? null,
      installments: plan.installments
        .filter((i) => i.status !== 'superseded')
        .map((i) => ({
          id: i.id,
          key: i.key,
          label: i.label,
          remaining: i.remaining,
          remainingFormatted: formatCurrency(i.remaining),
          amountDue: i.amountDue,
          amountDueFormatted: formatCurrency(i.amountDue),
          amountPaid: i.amountPaid,
          collectibleNow: i.collectibleNow,
          status: i.status,
        })),
    }
  }

  const imp = computeImplicitFullBalancePayable({
    totalCharged: summary.totalCharged,
    totalPaid: summary.totalPaid,
    billable,
  })
  const canPay = computeCanPay({
    balanceDue: imp.balanceDue,
    lineItemCount,
    billable,
    plan: null,
  })
  return {
    balanceDue: imp.balanceDue,
    balanceDueFormatted: formatCurrency(imp.balanceDue),
    amountDueNow: imp.amountDueNow,
    amountDueNowFormatted: formatCurrency(imp.amountDueNow),
    maxPayableNow: imp.maxPayableNow,
    canPay,
    isPaid: lineItemCount > 0 && imp.balanceDue <= 0,
    totalCharged: summary.totalCharged,
    totalPaid: summary.totalPaid,
    isBillable: billable,
    lockPortalToDueNow: false,
    allowPayAhead: true,
    planType: null,
    nextInstallmentLabel: null,
    installments: undefined,
  }
}

export type PortalJobPartitions = {
  activeNow: PortalJob[]
  comingUp: PortalJob[]
  past: PortalJob[]
}

const ACTIVE_STATUSES = new Set(['scheduled', 'in_progress'])

/** Clients only owe/pay after a visit has started or work is complete — not future recurring copies. */
export function isJobBillableForClient(
  job: Pick<PortalJobSchedule, 'status' | 'startTime'>,
  now = new Date()
): boolean {
  if (job.status === 'cancelled') return false
  if (job.status === 'archived' || job.status === 'in_progress') return true
  if (job.status === 'scheduled') {
    return new Date(job.startTime).getTime() <= now.getTime()
  }
  return false
}

export function formatPortalJobDate(
  startTime: string,
  timezone: string,
  now = new Date()
): string {
  const start = new Date(startTime)
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const jobDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(start)

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(tomorrow)

  let dayLabel: string
  if (jobDay === today) {
    dayLabel = 'Today'
  } else if (jobDay === tomorrowStr) {
    dayLabel = 'Tomorrow'
  } else {
    dayLabel = start.toLocaleDateString([], {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  return `${dayLabel} · ${formatTimeInTimezone(startTime, timezone)}`
}

export function formatPortalArrivalWindow(
  startTime: string,
  endTime: string,
  timezone: string
): string {
  const start = formatTimeInTimezone(startTime, timezone)
  const end = formatTimeInTimezone(endTime, timezone)

  const startDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(startTime))

  const endDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(endTime))

  if (startDay === endDay) {
    return `${start} – ${end}`
  }

  return `${start} – ${end}`
}

export function formatPortalJobDayHeading(startTime: string, timezone: string, now = new Date()) {
  const start = new Date(startTime)
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const jobDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(start)

  if (jobDay === today) return 'Today'

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(tomorrow)

  if (jobDay === tomorrowStr) return 'Tomorrow'

  return start.toLocaleDateString([], {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function isJobActiveNow(job: Pick<PortalJobSchedule, 'status' | 'startTime' | 'endTime'>, now = new Date()) {
  if (job.status === 'cancelled' || job.status === 'archived') return false
  if (job.status === 'in_progress') return true

  const nowMs = now.getTime()
  const startMs = new Date(job.startTime).getTime()
  const endMs = new Date(job.endTime).getTime()

  return job.status === 'scheduled' && nowMs >= startMs && nowMs <= endMs
}

export function isJobComingUp(job: Pick<PortalJobSchedule, 'status' | 'startTime' | 'endTime'>, now = new Date()) {
  if (!ACTIVE_STATUSES.has(job.status)) return false
  if (isJobActiveNow(job, now)) return false
  return new Date(job.startTime).getTime() > now.getTime()
}

export function isJobPast(job: Pick<PortalJobSchedule, 'status' | 'endTime'>, now = new Date()) {
  if (job.status === 'archived' || job.status === 'cancelled') return true
  return new Date(job.endTime).getTime() < now.getTime()
}

export function partitionPortalJobs(jobs: PortalJob[], now = new Date()): PortalJobPartitions {
  const activeNow: PortalJob[] = []
  const comingUp: PortalJob[] = []
  const past: PortalJob[] = []

  for (const job of jobs) {
    if (isJobActiveNow(job, now)) {
      activeNow.push(job)
    } else if (isJobComingUp(job, now)) {
      comingUp.push(job)
    } else if (isJobPast(job, now)) {
      past.push(job)
    } else {
      comingUp.push(job)
    }
  }

  const byStart = (a: PortalJob, b: PortalJob) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()

  activeNow.sort(byStart)
  comingUp.sort(byStart)
  past.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())

  return { activeNow, comingUp, past }
}

export function findFirstPayableJob(jobs: PortalJob[]) {
  return jobs.find((job) => job.canPay) ?? null
}

export function getPayableJobs(jobs: PortalJob[]) {
  return jobs
    .filter((job) => job.canPay && job.amountDueNow > 0)
    .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())
}

/** Sum of amounts collectible now across payable jobs (CTA / home balance). */
export function sumBillableBalanceDue(jobs: PortalJob[]) {
  return getPayableJobs(jobs).reduce((sum, job) => sum + job.amountDueNow, 0)
}

export type PortalPayableJob = {
  id: string
  title: string
  balanceDue: number
  balanceDueFormatted: string
}

export function toPayableJobRows(jobs: PortalJob[]): PortalPayableJob[] {
  return getPayableJobs(jobs).map((job) => ({
    id: job.id,
    title: job.title,
    // Payable list shows amount due now (what Pay will collect by default)
    balanceDue: job.amountDueNow,
    balanceDueFormatted: job.amountDueNowFormatted,
  }))
}