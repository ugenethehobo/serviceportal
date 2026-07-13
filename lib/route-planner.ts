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
import { getRoadRouteCoordinates } from '@/lib/road-routing'

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

type RawCrew = {
  id: string
  name: string
}

function unwrapRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export type RouteStop = {
  id: string
  kind: 'company' | 'job'
  order: number
  label: string
  subtitle?: string
  address: string
  startTime?: string
  endTime?: string
  longitude: number
  latitude: number
}

export type CrewRoute = {
  crewId: string
  crewName: string
  colorIndex: number
  stops: RouteStop[]
  coordinates: [number, number][]
  jobCount: number
  distanceMeters: number | null
  durationSeconds: number | null
  followsRoads: boolean
}

export type InvalidRouteAddress = {
  id: string
  crewName?: string
  label: string
  address: string
  reason: string
}

export type RoutePlannerData = {
  companyName: string
  dateLabel: string
  companyLocation: { longitude: number; latitude: number } | null
  routes: CrewRoute[]
  invalidAddresses: InvalidRouteAddress[]
}

export const CREW_ROUTE_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f97316',
  '#06b6d4',
  '#ec4899',
  '#a855f7',
  '#eab308',
  '#ef4444',
]

export async function buildRoutePlannerData(input: {
  companyName: string
  companyAddress?: string | null
  companyStructuredAddress?: StructuredAddress | null
  companyCoordinates?: StoredCoordinatesRow | null
  crews: RawCrew[]
  schedules: RawSchedule[]
  onGeocodesResolved?: (result: Awaited<ReturnType<typeof resolveGeocodeResults>>) => Promise<void>
}): Promise<RoutePlannerData> {
  const invalidAddresses: InvalidRouteAddress[] = []
  let companyLocation: { longitude: number; latitude: number } | null = null

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
  const geocodeEntries: GeocodeResolveEntry[] = []

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
    }
  }

  const crewJobsMap = new globalThis.Map<string, RawSchedule[]>()
  for (const schedule of input.schedules) {
    const crew = unwrapRelation(schedule.crew)
    if (!crew?.id || !schedule.crew_id) continue
    const existing = crewJobsMap.get(crew.id) || []
    existing.push(schedule)
    crewJobsMap.set(crew.id, existing)
  }

  const pendingGeocode: Array<{
    id: string
    crewName: string
    label: string
    subtitle?: string
    address: string
    startTime: string
    endTime: string
    clientId?: string
  }> = []

  for (const crew of input.crews) {
    const jobs = (crewJobsMap.get(crew.id) || []).sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )

    if (jobs.length === 0) continue

    for (const job of jobs) {
      const client = unwrapRelation(job.client)
      const locationAddress = client ? getDisplayAddressFromClient(client) : ''
      const geocodeId = `${crew.id}:${job.id}`

      if (!locationAddress) {
        invalidAddresses.push({
          id: geocodeId,
          crewName: crew.name,
          label: `${job.title} (${crew.name})`,
          address: client?.name ? `Client: ${client.name}` : 'No address on file',
          reason: 'Job site address is missing on the client record',
        })
        continue
      }

      const formatError = validateAddressFormat(locationAddress)
      if (formatError) {
        invalidAddresses.push({
          id: geocodeId,
          crewName: crew.name,
          label: `${job.title} (${crew.name})`,
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
        id: geocodeId,
        crewName: crew.name,
        label: job.title,
        subtitle: client?.name,
        address: locationAddress,
        startTime: job.start_time,
        endTime: job.end_time,
        clientId: client?.id,
      })
    }
  }

  const resolvedGeocodes = await resolveGeocodeResults(geocodeEntries)
  if (input.onGeocodesResolved) {
    await input.onGeocodesResolved(resolvedGeocodes)
  }

  const companyGeocode = resolvedGeocodes.results.get('company')
  if (companyGeocode?.success) {
    companyLocation = {
      longitude: companyGeocode.longitude,
      latitude: companyGeocode.latitude,
    }
  } else if (companyDisplayAddress && geocodeEntries.some((entry) => entry.id === 'company')) {
    invalidAddresses.push({
      id: 'company',
      label: `${input.companyName} (company)`,
      address: companyDisplayAddress,
      reason:
        companyGeocode && !companyGeocode.success
          ? companyGeocode.reason
          : 'Geocoding failed',
    })
  }

  const pendingRoutes: Array<{
    crewId: string
    crewName: string
    colorIndex: number
    stops: RouteStop[]
    waypoints: [number, number][]
    jobCount: number
  }> = []
  let colorIndex = 0

  for (const crew of input.crews) {
    const jobs = (crewJobsMap.get(crew.id) || []).sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )

    if (jobs.length === 0) continue

    const stops: RouteStop[] = []
    const coordinates: [number, number][] = []
    let jobOrder = 0

    if (companyLocation) {
      stops.push({
        id: `${crew.id}:company-start`,
        kind: 'company',
        order: 0,
        label: input.companyName,
        subtitle: 'Start',
        address: hasStructuredCompany
          ? formatAddressForDisplay(structuredCompany!)
          : input.companyAddress?.trim() || '',
        longitude: companyLocation.longitude,
        latitude: companyLocation.latitude,
      })
      coordinates.push([companyLocation.longitude, companyLocation.latitude])
    }

    for (const job of jobs) {
      const client = unwrapRelation(job.client)
      const geocodeId = `${crew.id}:${job.id}`
      const pending = pendingGeocode.find((entry) => entry.id === geocodeId)
      const result = pending?.clientId
        ? resolvedGeocodes.results.get(pending.clientId)
        : undefined

      if (!pending || !result?.success) {
        if (pending && result && !result.success) {
          invalidAddresses.push({
            id: geocodeId,
            crewName: crew.name,
            label: `${job.title} (${crew.name})`,
            address: pending.address,
            reason: result.reason,
          })
        }
        continue
      }

      jobOrder += 1
      stops.push({
        id: geocodeId,
        kind: 'job',
        order: jobOrder,
        label: job.title,
        subtitle: client?.name,
        address: pending.address,
        startTime: pending.startTime,
        endTime: pending.endTime,
        longitude: result.longitude,
        latitude: result.latitude,
      })
      coordinates.push([result.longitude, result.latitude])
    }

    if (companyLocation && stops.length > 0) {
      stops.push({
        id: `${crew.id}:company-end`,
        kind: 'company',
        order: jobOrder + 1,
        label: input.companyName,
        subtitle: 'Return',
        address: hasStructuredCompany
          ? formatAddressForDisplay(structuredCompany!)
          : input.companyAddress?.trim() || '',
        longitude: companyLocation.longitude,
        latitude: companyLocation.latitude,
      })
      coordinates.push([companyLocation.longitude, companyLocation.latitude])
    }

    if (coordinates.length < 2) continue

    pendingRoutes.push({
      crewId: crew.id,
      crewName: crew.name,
      colorIndex: colorIndex % CREW_ROUTE_COLORS.length,
      stops,
      waypoints: coordinates,
      jobCount: jobOrder,
    })
    colorIndex += 1
  }

  const roadRoutes = await Promise.all(
    pendingRoutes.map((route) => getRoadRouteCoordinates(route.waypoints))
  )

  const routes: CrewRoute[] = pendingRoutes.map((route, index) => {
    const roadRoute = roadRoutes[index]
    return {
      crewId: route.crewId,
      crewName: route.crewName,
      colorIndex: route.colorIndex,
      stops: route.stops,
      coordinates: roadRoute.coordinates,
      jobCount: route.jobCount,
      distanceMeters: roadRoute.distanceMeters,
      durationSeconds: roadRoute.durationSeconds,
      followsRoads: roadRoute.followsRoads,
    }
  })

  return {
    companyName: input.companyName,
    dateLabel: '',
    companyLocation,
    routes,
    invalidAddresses,
  }
}