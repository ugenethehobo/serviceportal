import { getDisplayAddressFromClient } from '@/lib/address'
import { SOLO_CREW_NAME } from '@/lib/company-operations'
import { formatTimeInTimezone } from '@/lib/timezone'

export const DISPATCH_UNASSIGNED_COLUMN_ID = 'unassigned'

export type DispatchDisplayStatus = 'Scheduled' | 'In Progress' | 'Completed'

export type DispatchJobCard = {
  id: string
  clientId: string
  title: string
  clientName: string
  location: string | null
  startTime: string
  endTime: string
  startLabel: string
  endLabel: string
  status: string
  displayStatus: DispatchDisplayStatus
  crewId: string | null
  hasCrewConflict: boolean
  href: string
  draggable: boolean
}

export type DispatchColumn = {
  id: string
  kind: 'unassigned' | 'crew'
  name: string
  jobs: DispatchJobCard[]
}

export type DispatchBoardData = {
  dayOffset: number
  dayLabel: string
  dateStr: string
  timezone: string
  isSoloBusiness: boolean
  soloCrewId: string | null
  columns: DispatchColumn[]
  unassignedCount: number
  jobCount: number
}

type RawDispatchClient =
  | {
      id: string
      name: string
      address?: string | null
      address_street?: string | null
      address_unit?: string | null
      address_city?: string | null
      address_state?: string | null
      address_zip?: string | null
    }
  | Array<{
      id: string
      name: string
      address?: string | null
      address_street?: string | null
      address_unit?: string | null
      address_city?: string | null
      address_state?: string | null
      address_zip?: string | null
    }>
  | null

export type RawDispatchSchedule = {
  id: string
  title: string
  start_time: string
  end_time: string
  status: string
  crew_id: string | null
  client_id: string
  client?: RawDispatchClient
}

export type DispatchCrew = {
  id: string
  name: string
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export function getDispatchPageTitle(isSoloBusiness: boolean) {
  return isSoloBusiness ? 'My Schedule' : 'Dispatch'
}

export function getDispatchPageDescription(isSoloBusiness: boolean) {
  return isSoloBusiness
    ? 'Plan your day — drag unassigned jobs onto yourself, or pull them off when plans change.'
    : 'Assign jobs to crews for the day. Drag cards between columns to reassign.'
}

export function getDispatchCrewColumnLabel(
  isSoloBusiness: boolean,
  crewName: string
) {
  if (!isSoloBusiness) return crewName
  if (crewName === SOLO_CREW_NAME) return 'You'
  return crewName
}

export function getDispatchDisplayStatus(
  status: string,
  startIso: string,
  endIso: string,
  now: Date = new Date()
): DispatchDisplayStatus {
  const nowMs = now.getTime()
  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()

  if (status === 'archived' || nowMs >= endMs) return 'Completed'
  if (
    status === 'in_progress' ||
    (status === 'scheduled' && nowMs >= startMs && nowMs < endMs)
  ) {
    return 'In Progress'
  }
  return 'Scheduled'
}

export function markDispatchCrewConflicts(jobs: DispatchJobCard[]): DispatchJobCard[] {
  const active = jobs.filter(
    (job) => job.draggable && job.crewId && job.displayStatus !== 'Completed'
  )

  return jobs.map((job) => {
    if (!job.crewId || !job.draggable || job.displayStatus === 'Completed') {
      return { ...job, hasCrewConflict: false }
    }

    const hasCrewConflict = active.some(
      (other) =>
        other.id !== job.id &&
        other.crewId === job.crewId &&
        other.startTime < job.endTime &&
        other.endTime > job.startTime
    )

    return { ...job, hasCrewConflict }
  })
}

function toJobCard(
  schedule: RawDispatchSchedule,
  timezone: string,
  now: Date
): DispatchJobCard {
  const client = unwrapRelation(schedule.client)
  const clientName = client?.name?.trim() || 'Client'
  const location = client ? getDisplayAddressFromClient(client) || null : null
  const displayStatus = getDispatchDisplayStatus(
    schedule.status,
    schedule.start_time,
    schedule.end_time,
    now
  )
  const draggable = schedule.status !== 'archived' && schedule.status !== 'cancelled'

  return {
    id: schedule.id,
    clientId: schedule.client_id,
    title: schedule.title?.trim() || clientName,
    clientName,
    location,
    startTime: schedule.start_time,
    endTime: schedule.end_time,
    startLabel: formatTimeInTimezone(schedule.start_time, timezone),
    endLabel: formatTimeInTimezone(schedule.end_time, timezone),
    status: schedule.status,
    displayStatus,
    crewId: schedule.crew_id,
    hasCrewConflict: false,
    href: `/dashboard/clients/${schedule.client_id}/jobs/${schedule.id}`,
    draggable,
  }
}

function sortJobsByStart(jobs: DispatchJobCard[]) {
  return [...jobs].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )
}

/**
 * Build day-based dispatch columns: Unassigned first, then crews.
 * Solo mode shows only the owner crew column (labeled "You").
 */
export function buildDispatchBoardData(input: {
  schedules: RawDispatchSchedule[]
  crews: DispatchCrew[]
  dayOffset: number
  dayLabel: string
  dateStr: string
  timezone: string
  isSoloBusiness: boolean
  soloCrewId: string | null
  now?: Date
}): DispatchBoardData {
  const now = input.now ?? new Date()
  const activeSchedules = input.schedules.filter(
    (schedule) => schedule.status !== 'cancelled'
  )

  let jobs = activeSchedules.map((schedule) => toJobCard(schedule, input.timezone, now))
  jobs = markDispatchCrewConflicts(jobs)

  const crewColumnsSource = input.isSoloBusiness
    ? input.crews.filter((crew) =>
        input.soloCrewId ? crew.id === input.soloCrewId : true
      )
    : [...input.crews].sort((a, b) => a.name.localeCompare(b.name))

  // Ensure solo column exists even if crew list is empty but soloCrewId is known
  if (
    input.isSoloBusiness &&
    input.soloCrewId &&
    !crewColumnsSource.some((crew) => crew.id === input.soloCrewId)
  ) {
    crewColumnsSource.push({ id: input.soloCrewId, name: SOLO_CREW_NAME })
  }

  const jobsByCrew = new Map<string | null, DispatchJobCard[]>()
  jobsByCrew.set(null, [])
  for (const crew of crewColumnsSource) {
    jobsByCrew.set(crew.id, [])
  }

  for (const job of jobs) {
    if (!job.crewId || !jobsByCrew.has(job.crewId)) {
      const unassigned = jobsByCrew.get(null) ?? []
      unassigned.push(job)
      jobsByCrew.set(null, unassigned)
      continue
    }
    const list = jobsByCrew.get(job.crewId) ?? []
    list.push(job)
    jobsByCrew.set(job.crewId, list)
  }

  const unassignedJobs = sortJobsByStart(jobsByCrew.get(null) ?? [])
  const columns: DispatchColumn[] = [
    {
      id: DISPATCH_UNASSIGNED_COLUMN_ID,
      kind: 'unassigned',
      name: 'Unassigned',
      jobs: unassignedJobs,
    },
    ...crewColumnsSource.map((crew) => ({
      id: crew.id,
      kind: 'crew' as const,
      name: getDispatchCrewColumnLabel(input.isSoloBusiness, crew.name),
      jobs: sortJobsByStart(jobsByCrew.get(crew.id) ?? []),
    })),
  ]

  return {
    dayOffset: input.dayOffset,
    dayLabel: input.dayLabel,
    dateStr: input.dateStr,
    timezone: input.timezone,
    isSoloBusiness: input.isSoloBusiness,
    soloCrewId: input.soloCrewId,
    columns,
    unassignedCount: unassignedJobs.length,
    jobCount: jobs.length,
  }
}

/** Resolve target crew id from a column drop target. */
export function resolveDispatchTargetCrewId(
  columnId: string,
  options?: { isSoloBusiness?: boolean; soloCrewId?: string | null }
): string | null {
  if (columnId === DISPATCH_UNASSIGNED_COLUMN_ID) return null
  if (options?.isSoloBusiness && options.soloCrewId && columnId !== options.soloCrewId) {
    return options.soloCrewId
  }
  return columnId
}
