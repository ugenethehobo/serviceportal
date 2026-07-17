import type { ActivityFeedItem } from '@/lib/activity-feed'
import { formatMinutesAsTime, type BusinessHours } from '@/lib/business-hours'
import { getMinutesFromMidnightInTimezone, formatTimeInTimezone } from '@/lib/timezone'

export type DashboardCrewSummary = {
  id: string
  name: string
  memberNames: string
  jobCount: number
  status: 'on_job' | 'available' | 'done'
  statusLabel: string
  detail: string
}

export type DashboardTimelineJob = {
  id: string
  clientId: string
  title: string
  crewName: string
  location: string
  status: string
  displayStatus: 'Scheduled' | 'In Progress' | 'Completed'
  startTime: string
  durationMinutes: number
  startMinutes: number
  endMinutes: number
  lane: number
}

type RawSchedule = {
  id: string
  title: string
  start_time: string
  end_time: string
  status: string
  client_id: string
  crew_id: string | null
  client: { name: string; address?: string | null } | { name: string; address?: string | null }[] | null
  crew: { id: string; name: string } | { id: string; name: string }[] | null
}

type RawCrew = {
  id: string
  name: string
  profiles: { id: string; full_name: string | null }[] | null
}

function unwrapRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function getDisplayStatus(status: string, startIso: string, endIso: string, now: Date): DashboardTimelineJob['displayStatus'] {
  const nowMs = now.getTime()
  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()

  if (status === 'archived' || nowMs >= endMs) return 'Completed'
  if (status === 'in_progress' || (status === 'scheduled' && nowMs >= startMs && nowMs < endMs)) {
    return 'In Progress'
  }
  return 'Scheduled'
}

export function buildTimelineJobs(
  schedules: RawSchedule[],
  timezone: string,
  now: Date = new Date()
): Omit<DashboardTimelineJob, 'lane'>[] {
  return schedules.map((schedule) => {
    const client = unwrapRelation(schedule.client)
    const crew = unwrapRelation(schedule.crew)
    const startMinutes = getMinutesFromMidnightInTimezone(schedule.start_time, timezone)
    const endMinutes = getMinutesFromMidnightInTimezone(schedule.end_time, timezone)
    const durationMinutes = Math.max(15, endMinutes - startMinutes)

    return {
      id: schedule.id,
      clientId: schedule.client_id,
      title: schedule.title,
      crewName: crew?.name || 'Unassigned',
      location: client?.address || client?.name || 'No location',
      status: schedule.status,
      displayStatus: getDisplayStatus(schedule.status, schedule.start_time, schedule.end_time, now),
      startTime: formatMinutesAsTime(startMinutes),
      durationMinutes,
      startMinutes,
      endMinutes,
    }
  })
}

export function assignTimelineLanes(
  jobs: Omit<DashboardTimelineJob, 'lane'>[]
): DashboardTimelineJob[] {
  const sorted = [...jobs].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes)
  const laneEnds: number[] = []

  return sorted.map((job) => {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= job.startMinutes)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(job.endMinutes)
    } else {
      laneEnds[lane] = job.endMinutes
    }
    return { ...job, lane }
  })
}

export function buildCrewSummaries(
  crews: RawCrew[],
  schedules: RawSchedule[],
  timezone: string,
  now: Date = new Date()
): DashboardCrewSummary[] {
  const nowMs = now.getTime()

  return crews.map((crew) => {
    const members = crew.profiles || []
    const memberNames = members.map((m) => m.full_name || 'Unnamed').join(', ') || 'No members assigned'
    const crewJobs = schedules.filter((schedule) => unwrapRelation(schedule.crew)?.id === crew.id)
    const jobCount = crewJobs.length

    const activeJob = crewJobs.find((schedule) => {
      const startMs = new Date(schedule.start_time).getTime()
      const endMs = new Date(schedule.end_time).getTime()
      return (
        schedule.status === 'in_progress' ||
        (schedule.status === 'scheduled' && nowMs >= startMs && nowMs < endMs)
      )
    })

    if (activeJob) {
      const client = unwrapRelation(activeJob.client)
      return {
        id: crew.id,
        name: crew.name,
        memberNames,
        jobCount,
        status: 'on_job',
        statusLabel: 'On Job',
        detail: `Currently at: ${client?.address || client?.name || 'Unknown location'}`,
      }
    }

    const nextJob = crewJobs
      .filter((schedule) => schedule.status === 'scheduled' && new Date(schedule.start_time).getTime() > nowMs)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0]

    if (nextJob) {
      return {
        id: crew.id,
        name: crew.name,
        memberNames,
        jobCount,
        status: 'available',
        statusLabel: 'Available',
        detail: `Next job at ${formatTimeInTimezone(nextJob.start_time, timezone)}`,
      }
    }

    if (jobCount > 0) {
      return {
        id: crew.id,
        name: crew.name,
        memberNames,
        jobCount,
        status: 'done',
        statusLabel: 'Done for today',
        detail: `${jobCount} ${jobCount === 1 ? 'job' : 'jobs'} today`,
      }
    }

    return {
      id: crew.id,
      name: crew.name,
      memberNames,
      jobCount: 0,
      status: 'available',
      statusLabel: 'Available',
      detail: 'No jobs today',
    }
  })
}

export type TimelineDayMode = 'today' | 'tomorrow'

export type DashboardMode = 'live' | 'closed_day'

export type DashboardCollectedSource = 'stripe' | 'recorded'

export type DashboardMonthlyKpis = {
  monthLabel: string
  totalBilled: number
  totalCollected: number
  collectedSource: DashboardCollectedSource
  balanceDue: number
  jobsCompleted: number
  jobsScheduled: number
  activeClients: number
  leadsConverted: number
  estimatesSent: number
}

export type DashboardOverviewData = {
  timezone: string
  businessHours: BusinessHours
  dashboardMode: DashboardMode
  crews: DashboardCrewSummary[]
  jobs: DashboardTimelineJob[]
  laneCount: number
  timelineMode: TimelineDayMode
  timelineDateLabel: string
  closedDayLabel?: string
  monthlyKpis?: DashboardMonthlyKpis
  isSoloBusiness?: boolean
  /** Plural crew label (default "Crews"). */
  crewLabel?: string
  activity: ActivityFeedItem[]
}