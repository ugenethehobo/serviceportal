import {
  getDisplayAddressFromClient,
  structuredAddressFromCompanyRow,
  type StructuredAddress,
} from '@/lib/address'
import type { StoredCoordinatesRow } from '@/lib/address-geocoding'
import {
  buildRoutePlannerData,
  type CrewRoute,
  type InvalidRouteAddress,
} from '@/lib/route-planner'
import { formatTimeInTimezone } from '@/lib/timezone'

export type TeamMemberJob = {
  id: string
  clientId: string
  title: string
  clientName: string
  address: string
  startTime: string
  endTime: string
  status: string
  displayStatus: 'Scheduled' | 'In Progress' | 'Completed'
  timeLabel: string
  /** True when this job is on My Day only because the user is a helper (P4). */
  isHelper?: boolean
  helperCount?: number
}

export type TeamMemberDashboardData = {
  crewName: string | null
  crewId: string | null
  companyName: string
  dateLabel: string
  jobs: TeamMemberJob[]
  hasCrew: boolean
  /** User is designated crew lead for their home crew (P4). */
  isCrewLead?: boolean
  route: CrewRoute | null
  companyLocation: { longitude: number; latitude: number } | null
  invalidAddresses: InvalidRouteAddress[]
}

type RawSchedule = {
  id: string
  title: string
  start_time: string
  end_time: string
  status: string
  client_id: string
  client:
    | ({
        id?: string
        name: string
        address?: string | null
        address_street?: string | null
        address_unit?: string | null
        address_city?: string | null
        address_state?: string | null
        address_zip?: string | null
      } & StoredCoordinatesRow)
    | Array<
        {
          id?: string
          name: string
          address?: string | null
          address_street?: string | null
          address_unit?: string | null
          address_city?: string | null
          address_state?: string | null
          address_zip?: string | null
        } & StoredCoordinatesRow
      >
    | null
}

function unwrapClient(client: RawSchedule['client']) {
  if (!client) return null
  return Array.isArray(client) ? client[0] ?? null : client
}

function getDisplayStatus(
  status: string,
  startIso: string,
  endIso: string,
  now: Date
): TeamMemberJob['displayStatus'] {
  const nowMs = now.getTime()
  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()

  if (status === 'archived' || nowMs >= endMs) return 'Completed'
  if (status === 'in_progress' || (status === 'scheduled' && nowMs >= startMs && nowMs < endMs)) {
    return 'In Progress'
  }
  return 'Scheduled'
}

export function buildTeamMemberJobs(
  schedules: RawSchedule[],
  timezone: string,
  now = new Date(),
  options?: {
    helperJobIds?: Set<string>
    helperCounts?: Map<string, number>
  }
): TeamMemberJob[] {
  return schedules.map((schedule) => {
    const client = unwrapClient(schedule.client)
    const address = client ? getDisplayAddressFromClient(client) : ''
    const isHelper = options?.helperJobIds?.has(schedule.id) ?? false

    return {
      id: schedule.id,
      clientId: schedule.client_id,
      title: schedule.title,
      clientName: client?.name || 'Unknown client',
      address: address || 'No address on file',
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      status: schedule.status,
      displayStatus: getDisplayStatus(
        schedule.status,
        schedule.start_time,
        schedule.end_time,
        now
      ),
      timeLabel: `${formatTimeInTimezone(schedule.start_time, timezone)} – ${formatTimeInTimezone(schedule.end_time, timezone)}`,
      isHelper,
      helperCount: options?.helperCounts?.get(schedule.id) ?? 0,
    }
  })
}

/** Merge crew-day jobs with helper-only jobs; prefer primary crew entry over helper flag. */
export function mergeTeamMemberDaySchedules(
  crewSchedules: RawSchedule[],
  helperSchedules: RawSchedule[]
): { schedules: RawSchedule[]; helperOnlyIds: Set<string> } {
  const byId = new Map<string, RawSchedule>()
  for (const s of crewSchedules) {
    byId.set(s.id, s)
  }
  const helperOnlyIds = new Set<string>()
  for (const s of helperSchedules) {
    if (!byId.has(s.id)) {
      byId.set(s.id, s)
      helperOnlyIds.add(s.id)
    }
  }
  const schedules = Array.from(byId.values()).sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )
  return { schedules, helperOnlyIds }
}

type RouteScheduleInput = {
  id: string
  title: string
  start_time: string
  end_time: string
  status: string
  client_id: string
  client: RawSchedule['client']
}

function toRoutePlannerSchedules(
  schedules: RouteScheduleInput[],
  crew: { id: string; name: string }
) {
  return schedules.map((schedule) => {
    const client = unwrapClient(schedule.client)
    return {
      id: schedule.id,
      title: schedule.title,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      status: schedule.status,
      crew_id: crew.id,
      client: client
        ? {
            id: client.id || schedule.client_id,
            name: client.name,
            address: client.address,
            address_street: client.address_street,
            address_unit: client.address_unit,
            address_city: client.address_city,
            address_state: client.address_state,
            address_zip: client.address_zip,
            latitude: client.latitude,
            longitude: client.longitude,
            geocode_address_key: client.geocode_address_key,
          }
        : null,
      crew: { id: crew.id, name: crew.name },
    }
  })
}

export async function buildTeamMemberRouteData(input: {
  companyName: string
  companyAddress?: string | null
  companyStructuredAddress?: StructuredAddress | null
  companyCoordinates?: StoredCoordinatesRow | null
  crew: { id: string; name: string }
  schedules: RouteScheduleInput[]
  onGeocodesResolved?: Parameters<typeof buildRoutePlannerData>[0]['onGeocodesResolved']
}): Promise<{
  route: CrewRoute | null
  companyLocation: { longitude: number; latitude: number } | null
  invalidAddresses: InvalidRouteAddress[]
}> {
  const routeSchedules = toRoutePlannerSchedules(input.schedules, input.crew)
  const plannerData = await buildRoutePlannerData({
    companyName: input.companyName,
    companyAddress: input.companyAddress,
    companyStructuredAddress: input.companyStructuredAddress,
    companyCoordinates: input.companyCoordinates,
    crews: [input.crew],
    schedules: routeSchedules,
    onGeocodesResolved: input.onGeocodesResolved,
  })

  return {
    route: plannerData.routes[0] ?? null,
    companyLocation: plannerData.companyLocation,
    invalidAddresses: plannerData.invalidAddresses,
  }
}

export function structuredAddressFromCompany(input: {
  address_street?: string | null
  address_unit?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
}): StructuredAddress | null {
  const structured = structuredAddressFromCompanyRow(input)
  if (!structured.street) return null
  return structured
}