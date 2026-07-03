import {
  formatAddressForDisplay,
  hasCompleteStructuredAddress,
  type StructuredAddress,
} from '@/lib/address'
import {
  geocodeAddresses,
  geocodeStructuredAddress,
  validateAddressFormat,
} from '@/lib/geocoding'

type RawSchedule = {
  id: string
  title: string
  start_time: string
  end_time: string
  status: string
  crew_id: string | null
  client: { name: string; address?: string | null } | { name: string; address?: string | null }[] | null
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

export type MapMarkerData = {
  id: string
  kind: 'company' | 'crew'
  label: string
  subtitle?: string
  address: string
  longitude: number
  latitude: number
}

export type InvalidMapAddress = {
  id: string
  label: string
  address: string
  reason: string
}

export type DashboardMapData = {
  companyName: string
  markers: MapMarkerData[]
  invalidAddresses: InvalidMapAddress[]
}

export async function buildDashboardMapData(input: {
  companyName: string
  companyAddress?: string | null
  companyStructuredAddress?: StructuredAddress | null
  crews: RawCrew[]
  schedules: RawSchedule[]
  now?: Date
}): Promise<DashboardMapData> {
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const invalidAddresses: InvalidMapAddress[] = []
  const markers: MapMarkerData[] = []
  const pendingGeocode: Array<{
    id: string
    kind: 'company' | 'crew'
    label: string
    subtitle?: string
    address: string
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

  for (const crew of input.crews) {
    const crewJobs = input.schedules.filter(
      (schedule) => unwrapRelation(schedule.crew)?.id === crew.id
    )

    const activeJob = crewJobs.find((schedule) => {
      const startMs = new Date(schedule.start_time).getTime()
      const endMs = new Date(schedule.end_time).getTime()
      return (
        schedule.status === 'in_progress' ||
        (schedule.status === 'scheduled' && nowMs >= startMs && nowMs < endMs)
      )
    })

    if (!activeJob) continue

    const client = unwrapRelation(activeJob.client)
    const locationAddress = client?.address?.trim() || ''
    const label = crew.name
    const subtitle = activeJob.title

    if (!locationAddress) {
      invalidAddresses.push({
        id: crew.id,
        label: `${crew.name} (active job)`,
        address: client?.name ? `Client: ${client.name}` : 'No address on file',
        reason: 'Job site address is missing on the client record',
      })
      continue
    }

    const formatError = validateAddressFormat(locationAddress)
    if (formatError) {
      invalidAddresses.push({
        id: crew.id,
        label: `${crew.name} (active job)`,
        address: locationAddress,
        reason: formatError.reason,
      })
      continue
    }

    pendingGeocode.push({
      id: crew.id,
      kind: 'crew',
      label,
      subtitle,
      address: locationAddress,
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
            : `${entry.label} (active job)`,
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
    })
  }

  return {
    companyName: input.companyName,
    markers,
    invalidAddresses,
  }
}