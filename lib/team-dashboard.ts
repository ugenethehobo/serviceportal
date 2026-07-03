import {
  getDisplayAddressFromClient,
  structuredAddressFromCompanyRow,
  type StructuredAddress,
} from '@/lib/address'
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
}

export type TeamMemberDashboardData = {
  crewName: string | null
  crewId: string | null
  companyName: string
  dateLabel: string
  jobs: TeamMemberJob[]
  hasCrew: boolean
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
    | {
        name: string
        address?: string | null
        address_street?: string | null
        address_unit?: string | null
        address_city?: string | null
        address_state?: string | null
        address_zip?: string | null
      }
    | {
        name: string
        address?: string | null
        address_street?: string | null
        address_unit?: string | null
        address_city?: string | null
        address_state?: string | null
        address_zip?: string | null
      }[]
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
  now = new Date()
): TeamMemberJob[] {
  return schedules.map((schedule) => {
    const client = unwrapClient(schedule.client)
    const address = client ? getDisplayAddressFromClient(client) : ''

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
    }
  })
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
            id: schedule.client_id,
            name: client.name,
            address: getDisplayAddressFromClient(client),
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
  crew: { id: string; name: string }
  schedules: RouteScheduleInput[]
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
    crews: [input.crew],
    schedules: routeSchedules,
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