import {
  formatAddressForDisplay,
  getDisplayAddressFromClient,
  hasCompleteStructuredAddress,
  type StructuredAddress,
} from '@/lib/address'
import {
  buildClientGeocodeAddressKey,
  buildCompanyGeocodeAddressKey,
  resolveGeocodeResults,
  type GeocodeResolveEntry,
  type StoredCoordinatesRow,
} from '@/lib/address-geocoding'
import { validateAddressFormat } from '@/lib/geocoding'
import { formatTimeInTimezone } from '@/lib/timezone'

const ACTIVE_MAP_JOB_STATUSES = new Set(['scheduled', 'in_progress'])
const TODAY_MAP_JOB_STATUSES = new Set(['scheduled', 'in_progress', 'archived'])

type RawSchedule = {
  id: string
  title: string
  start_time: string
  end_time: string
  status: string
  crew_id: string | null
  client:
    | ({
        id: string
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
          id: string
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
  completed?: boolean
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
  options?: { includeDayLabel?: boolean; completed?: boolean }
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

  if (options?.completed) {
    parts.push('Completed')
  } else if (schedule.status === 'in_progress') {
    parts.push('In progress')
  }

  return parts.join(' · ')
}

function isTodayMapJobCompleted(schedule: RawSchedule, now: Date): boolean {
  if (schedule.status === 'archived') return true
  return now.getTime() >= new Date(schedule.end_time).getTime()
}

function shouldIncludeScheduleOnMap(
  schedule: RawSchedule,
  mode: DashboardMapMode,
  now: Date
): boolean {
  if (schedule.status === 'cancelled') return false
  if (mode === 'today') {
    if (TODAY_MAP_JOB_STATUSES.has(schedule.status)) return true
    if (ACTIVE_MAP_JOB_STATUSES.has(schedule.status) && isTodayMapJobCompleted(schedule, now)) {
      return true
    }
    return false
  }
  return ACTIVE_MAP_JOB_STATUSES.has(schedule.status)
}

export async function buildDashboardMapData(input: {
  companyName: string
  companyAddress?: string | null
  companyStructuredAddress?: StructuredAddress | null
  companyCoordinates?: StoredCoordinatesRow | null
  schedules: RawSchedule[]
  timezone?: string
  now?: Date
  mode?: DashboardMapMode
  previewRangeLabel?: string
  onGeocodesResolved?: (result: Awaited<ReturnType<typeof resolveGeocodeResults>>) => Promise<void>
}): Promise<DashboardMapData> {
  const timezone = input.timezone || 'America/Chicago'
  const now = input.now ?? new Date()
  const mapMode = input.mode || 'today'
  const invalidAddresses: InvalidMapAddress[] = []
  const markers: MapMarkerData[] = []
  const pendingGeocode: Array<{
    id: string
    lookupId: string
    kind: 'company' | 'job'
    label: string
    subtitle?: string
    address: string
    crewId?: string | null
    status?: string
    completed?: boolean
  }> = []
  const geocodeEntries: GeocodeResolveEntry[] = []

  const structuredCompany = input.companyStructuredAddress
  const hasStructuredCompany =
    structuredCompany && hasCompleteStructuredAddress(structuredCompany)
  const companyDisplayAddress = hasStructuredCompany
    ? formatAddressForDisplay(structuredCompany)
    : input.companyAddress?.trim() || ''
  const companyAddressKey = buildCompanyGeocodeAddressKey({
    address: input.companyAddress,
    address_street: structuredCompany?.street,
    address_unit: structuredCompany?.unit,
    address_city: structuredCompany?.city,
    address_state: structuredCompany?.state,
    address_zip: structuredCompany?.zip,
  })

  if (!companyDisplayAddress) {
    invalidAddresses.push({
      id: 'company',
      label: `${input.companyName} (company)`,
      address: '',
      reason: 'Company address is not set — complete the form in Settings',
    })
  } else {
    const formatError = validateAddressFormat(companyDisplayAddress)
    if (formatError) {
      invalidAddresses.push({
        id: 'company',
        label: `${input.companyName} (company)`,
        address: companyDisplayAddress,
        reason: formatError.reason,
      })
    } else {
      geocodeEntries.push({
        id: 'company',
        address: companyDisplayAddress,
        addressKey: companyAddressKey,
        stored: input.companyCoordinates || undefined,
        persistTarget: 'company',
      })
      pendingGeocode.push({
        id: 'company',
        lookupId: 'company',
        kind: 'company',
        label: input.companyName,
        subtitle: 'Company location',
        address: companyDisplayAddress,
      })
    }
  }

  for (const schedule of input.schedules) {
    if (!shouldIncludeScheduleOnMap(schedule, mapMode, now)) continue

    const client = unwrapRelation(schedule.client)
    const crew = unwrapRelation(schedule.crew)
    const completed = mapMode === 'today' && isTodayMapJobCompleted(schedule, now)
    const locationAddress = client ? getDisplayAddressFromClient(client) : ''
    const label = buildJobLabel(schedule, client)
    const warningLabel = buildJobWarningLabel(schedule, client, crew)
    const subtitle = buildJobSubtitle(schedule, client, crew, timezone, {
      includeDayLabel: mapMode === 'upcoming_open_days',
      completed,
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

    if (client?.id) {
      geocodeEntries.push({
        id: client.id,
        address: locationAddress,
        addressKey: buildClientGeocodeAddressKey(client),
        stored: client,
        persistTarget: 'client',
        persistId: client.id,
      })
    }

    pendingGeocode.push({
      id: schedule.id,
      lookupId: client?.id || schedule.id,
      kind: 'job',
      label,
      subtitle,
      address: locationAddress,
      crewId: crew?.id ?? schedule.crew_id,
      status: schedule.status,
      completed,
    })
  }

  const resolvedGeocodes = await resolveGeocodeResults(geocodeEntries)
  if (input.onGeocodesResolved) {
    await input.onGeocodesResolved(resolvedGeocodes)
  }

  for (const entry of pendingGeocode) {
    const result = resolvedGeocodes.results.get(entry.lookupId)
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
      completed: entry.completed,
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