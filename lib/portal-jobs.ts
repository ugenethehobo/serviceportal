import { formatTimeInTimezone } from '@/lib/timezone'

export type PortalJobCrew = {
  id: string
  name: string
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

export type PortalJobBilling = {
  balanceDue: number
  balanceDueFormatted: string
  canPay: boolean
  isPaid: boolean
  totalCharged: number
  totalPaid: number
  isBillable: boolean
}

export type PortalJob = PortalJobSchedule & PortalJobBilling

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
    .filter((job) => job.canPay && job.balanceDue > 0)
    .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())
}

export function sumBillableBalanceDue(jobs: PortalJob[]) {
  return getPayableJobs(jobs).reduce((sum, job) => sum + job.balanceDue, 0)
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
    balanceDue: job.balanceDue,
    balanceDueFormatted: job.balanceDueFormatted,
  }))
}