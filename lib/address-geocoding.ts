import {
  formatAddressForDisplay,
  getDisplayAddressFromClient,
  hasCompleteStructuredAddress,
  structuredAddressFromClientRow,
  structuredAddressFromCompanyRow,
  type StructuredAddress,
} from '@/lib/address'
import {
  geocodeAddress,
  geocodeAddresses,
  geocodeStructuredAddress,
  normalizeGeocodeAddressKey,
  type GeocodeResult,
  type GeocodeSuccess,
} from '@/lib/geocoding'

export type StoredCoordinatesRow = {
  latitude?: number | null
  longitude?: number | null
  geocode_address_key?: string | null
}

export type GeocodePersistTarget = 'client' | 'company'

export type GeocodeResolveEntry = {
  id: string
  address: string
  addressKey: string | null
  stored?: StoredCoordinatesRow | null
  persistTarget?: GeocodePersistTarget
  persistId?: string
}

export type GeocodePersistUpdate = {
  addressKey: string
  latitude: number
  longitude: number
}

export const CLEARED_GEOCODE_FIELDS = {
  latitude: null,
  longitude: null,
  geocode_address_key: null,
} as const

export function buildClientGeocodeAddressKey(client: {
  address?: string | null
  address_street?: string | null
  address_unit?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
}): string | null {
  const display = getDisplayAddressFromClient(client)
  return display ? normalizeGeocodeAddressKey(display) : null
}

export function buildCompanyGeocodeAddressKey(input: {
  address?: string | null
  address_street?: string | null
  address_unit?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
}): string | null {
  const structured = structuredAddressFromCompanyRow(input)
  if (structured.street && hasCompleteStructuredAddress(structured)) {
    return normalizeGeocodeAddressKey(formatAddressForDisplay(structured))
  }

  const legacy = input.address?.trim()
  return legacy ? normalizeGeocodeAddressKey(legacy) : null
}

export function buildStructuredGeocodeAddressKey(
  address: StructuredAddress
): string | null {
  if (!hasCompleteStructuredAddress(address)) return null
  return normalizeGeocodeAddressKey(formatAddressForDisplay(address))
}

export function readStoredGeocode(
  row: StoredCoordinatesRow,
  addressKey: string | null
): GeocodeSuccess | null {
  if (!addressKey) return null

  const latitude = row.latitude
  const longitude = row.longitude
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (row.geocode_address_key !== addressKey) return null

  return {
    success: true,
    latitude: latitude as number,
    longitude: longitude as number,
    displayName: addressKey,
  }
}

export function buildGeocodePersistFields(
  result: GeocodeSuccess,
  addressKey: string
) {
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    geocode_address_key: addressKey,
  }
}

function dedupeResolveEntries(entries: GeocodeResolveEntry[]): GeocodeResolveEntry[] {
  const byId = new Map<string, GeocodeResolveEntry>()
  for (const entry of entries) {
    byId.set(entry.id, entry)
  }
  return Array.from(byId.values())
}

export async function resolveGeocodeResults(entries: GeocodeResolveEntry[]): Promise<{
  results: Map<string, GeocodeResult>
  clientPersist: Map<string, GeocodePersistUpdate>
  companyPersist: GeocodePersistUpdate | null
}> {
  const results = new Map<string, GeocodeResult>()
  const clientPersist = new Map<string, GeocodePersistUpdate>()
  let companyPersist: GeocodePersistUpdate | null = null

  const uniqueEntries = dedupeResolveEntries(entries)
  const pendingByAddressKey = new Map<
    string,
    {
      address: string
      entryIds: string[]
      persistTarget?: GeocodePersistTarget
      persistId?: string
    }
  >()

  for (const entry of uniqueEntries) {
    const stored = entry.addressKey
      ? readStoredGeocode(entry.stored || {}, entry.addressKey)
      : null

    if (stored) {
      results.set(entry.id, stored)
      continue
    }

    if (!entry.addressKey || !entry.address.trim()) {
      results.set(entry.id, { success: false, reason: 'Address is missing' })
      continue
    }

    const existing = pendingByAddressKey.get(entry.addressKey)
    if (existing) {
      existing.entryIds.push(entry.id)
      continue
    }

    pendingByAddressKey.set(entry.addressKey, {
      address: entry.address,
      entryIds: [entry.id],
      persistTarget: entry.persistTarget,
      persistId: entry.persistId,
    })
  }

  if (pendingByAddressKey.size > 0) {
    const geocoded = await geocodeAddresses(
      [...pendingByAddressKey.entries()].map(([addressKey, pending]) => ({
        id: addressKey,
        address: pending.address,
      }))
    )

    for (const [addressKey, pending] of pendingByAddressKey.entries()) {
      const result = geocoded.get(addressKey)
      if (!result) continue

      for (const entryId of pending.entryIds) {
        results.set(entryId, result)
      }

      if (!result.success) continue

      const persistPayload: GeocodePersistUpdate = {
        addressKey,
        latitude: result.latitude,
        longitude: result.longitude,
      }

      if (pending.persistTarget === 'company') {
        companyPersist = persistPayload
      } else if (pending.persistTarget === 'client' && pending.persistId) {
        clientPersist.set(pending.persistId, persistPayload)
      }
    }
  }

  return { results, clientPersist, companyPersist }
}

export async function geocodeClientAddressFields(input: {
  address?: string | null
  address_street?: string | null
  address_unit?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
}): Promise<typeof CLEARED_GEOCODE_FIELDS | ReturnType<typeof buildGeocodePersistFields>> {
  const structured = structuredAddressFromClientRow(input)
  const addressKey = buildClientGeocodeAddressKey(input)

  if (!addressKey) {
    return CLEARED_GEOCODE_FIELDS
  }

  const geocodeResult =
    structured.street && hasCompleteStructuredAddress(structured)
      ? await geocodeStructuredAddress(structured)
      : await geocodeAddress(getDisplayAddressFromClient(input))

  if (!geocodeResult.success) {
    return CLEARED_GEOCODE_FIELDS
  }

  return buildGeocodePersistFields(geocodeResult, addressKey)
}

export async function geocodeCompanyAddressFields(
  address: StructuredAddress
): Promise<typeof CLEARED_GEOCODE_FIELDS | ReturnType<typeof buildGeocodePersistFields>> {
  const addressKey = buildStructuredGeocodeAddressKey(address)
  if (!addressKey) {
    return CLEARED_GEOCODE_FIELDS
  }

  const geocodeResult = await geocodeStructuredAddress(address)
  if (!geocodeResult.success) {
    return CLEARED_GEOCODE_FIELDS
  }

  return buildGeocodePersistFields(geocodeResult, addressKey)
}