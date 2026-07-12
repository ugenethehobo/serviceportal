import {
  formatAddressForDisplay,
  getDisplayAddressFromClient,
  hasCompleteStructuredAddress,
  type StructuredAddress,
} from '@/lib/address'
import {
  geocodeAddresses,
  geocodeStructuredAddress,
  validateAddressFormat,
} from '@/lib/geocoding'
import { formatTimeInTimezone } from '@/lib/timezone'

const TODAY_MAP_JOB_STATUSES = new Set(['scheduled', 'in_progress'])

type RawSchedule = {
  id: string
  title: string
  start_time: string
  end_time: string
  status: string
  crew_id: string | null
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
  crew: { id: string; name: string } | { id: string; name: string }[] | null
}

function unwrapRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export type MapMarkerData = {
  id: string
  kind: 'company' | 'job'
  label: string
  subtitle?: string
  address: string
  longitude: number
  latitude: number
  crewId?: string | null
  status?: string
}

export type InvalidMapAddress = {
  id: string
  label: string
  address: string
  reason: string
}

export type DashboardMapMode = 'today' | 'upcoming_open_days'

export type DashboardMapData = {
  companyName: string
  mode: DashboardMapMode
  previewRangeLabel?: string
  previewJobCount?: number
  markers: MapMarkerData[]
  invalidAddresses: InvalidMapAddress[]
}

function formatJobTimeRange(startIso: string, endIso: string, timezone: string): string {
  const start = formatTimeInTimezone(startIso, timezone)
  const end = formatTimeInTimezone(endIso, timezone)
  return `${start} – ${end}`
}

function buildJobLabel(schedule: RawSchedule, client: { name: string } | null): string {
  const title = schedule.title?.trim()
  if (title) return title
  if (client?.name) return client.name
  return 'Scheduled job'
}

function buildJobWarningLabel(
  schedule: RawSchedule,
  client: { name: string } | null,
  crew: { name: string } | null
): string {
  const base = buildJobLabel(schedule, client)
  if (crew?.name) return `${base} (${crew.name})`
  return base
}

function formatJobDayLabel(startIso: string, timezone: string): string {
  const anchor = new Date(startIso)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(anchor)
}

function buildJobSubtitle(
  schedule: RawSchedule,
  client: { name: string } | null,
  crew: { name: string } | null,
  timezone: string,
  options?: { includeDayLabel?: boolean }
): string | undefined {
  const parts: string[] = []
  if (options?.includeDayLabel) {
    parts.push(formatJobDayLabel(schedule.start_time, timezone))
  }
  const timeRange = formatJobTimeRange(schedule.start_time, schedule.end_time, timezone)
  parts.push(timeRange)

  if (crew?.name) parts.push(crew.name)
  if (client?.name && client.name !== schedule.title?.trim()) {
    parts.push(client.name)
  }

  if (schedule.status === 'in_progress') {
    parts.push('In progress')
  }

  return parts.join(' · ')
}

export async function buildDashboardMapData(input: {
  companyName: string
  companyAddress?: string | null
  companyStructuredAddress?: StructuredAddress | null
  schedules: RawSchedule[]
  timezone?: string
  now?: Date
  mode?: DashboardMapMode
  previewRangeLabel?: string
}): Promise<DashboardMapData> {
  const timezone = input.timezone || 'America/Chicago'
  const invalidAddresses: InvalidMapAddress[] = []
  const markers: MapMarkerData[] = []
  const pendingGeocode: Array<{
    id: string
    kind: 'company' | 'job'
    label: string
    subtitle?: string
    address: string
    crewId?: string | null
    status?: string
  }> = []

  const structuredCompany = input.companyStructuredAddress
  const hasStructuredCompany =
    structuredCompany && hasCompleteStructuredAddress(structuredCompany)

  if (hasStructuredCompany) {
    const displayAddress = formatAddressForDisplay(structuredCompany)
    const geocodeResult = await geocodeStructuredAddress(structuredCompany)

    if (geocodeResult.success) {
      markers.push({
        id: 'company',
        kind: 'company',
        label: input.companyName,
        subtitle: 'Company location',
        address: displayAddress,
        longitude: geocodeResult.longitude,
        latitude: geocodeResult.latitude,
      })
    } else {
      invalidAddresses.push({
        id: 'company',
        label: `${input.companyName} (company)`,
        address: displayAddress,
        reason: geocodeResult.reason,
      })
    }
  } else {
    const companyAddress = input.companyAddress?.trim()
    if (companyAddress) {
      const formatError = validateAddressFormat(companyAddress)
      if (formatError) {
        invalidAddresses.push({
          id: 'company',
          label: `${input.companyName} (company)`,
          address: companyAddress,
          reason: formatError.reason,
        })
      } else {
        pendingGeocode.push({
          id: 'company',
          kind: 'company',
          label: input.companyName,
          subtitle: 'Company location',
          address: companyAddress,
        })
      }
    } else {
      invalidAddresses.push({
        id: 'company',
        label: `${input.companyName} (company)`,
        address: '',
        reason: 'Company address is not set — complete the form in Settings',
      })
    }
  }

  for (const schedule of input.schedules) {
    if (!TODAY_MAP_JOB_STATUSES.has(schedule.status)) continue

    const client = unwrapRelation(schedule.client)
    const crew = unwrapRelation(schedule.crew)
    const locationAddress = client ? getDisplayAddressFromClient(client) : ''
    const label = buildJobLabel(schedule, client)
    const warningLabel = buildJobWarningLabel(schedule, client, crew)
    const subtitle = buildJobSubtitle(schedule, client, crew, timezone, {
      includeDayLabel: input.mode === 'upcoming_open_days',
    })

    if (!locationAddress) {
      invalidAddresses.push({
        id: schedule.id,
        label: warningLabel,
        address: client?.name ? `Client: ${client.name}` : 'No address on file',
        reason: 'Job site address is missing on the client record',
      })
      continue
    }

    const formatError = validateAddressFormat(locationAddress)
    if (formatError) {
      invalidAddresses.push({
        id: schedule.id,
        label: warningLabel,
        address: locationAddress,
        reason: formatError.reason,
      })
      continue
    }

    pendingGeocode.push({
      id: schedule.id,
      kind: 'job',
      label,
      subtitle,
      address: locationAddress,
      crewId: crew?.id ?? schedule.crew_id,
      status: schedule.status,
    })
  }

  const geocoded = await geocodeAddresses(
    pendingGeocode.map((entry) => ({ id: entry.id, address: entry.address }))
  )

  for (const entry of pendingGeocode) {
    const result = geocoded.get(entry.id)
    if (!result) continue

    if (!result.success) {
      invalidAddresses.push({
        id: entry.id,
        label:
          entry.kind === 'company'
            ? `${entry.label} (company)`
            : entry.label,
        address: entry.address,
        reason: result.reason,
      })
      continue
    }

    markers.push({
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      subtitle: entry.subtitle,
      address: entry.address,
      longitude: result.longitude,
      latitude: result.latitude,
      crewId: entry.crewId,
      status: entry.status,
    })
  }

  const jobMarkers = markers.filter((marker) => marker.kind === 'job')

  return {
    companyName: input.companyName,
    mode: input.mode || 'today',
    previewRangeLabel: input.previewRangeLabel,
    previewJobCount: input.mode === 'upcoming_open_days' ? jobMarkers.length : undefined,
    markers,
    invalidAddresses,
  }
}