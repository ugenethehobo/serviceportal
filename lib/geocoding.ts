import {
  formatAddressForGeocoding,
  formatAddressForDisplay,
  formatStreetLine,
  hasCompleteStructuredAddress,
  US_STATES,
  type StructuredAddress,
} from '@/lib/address'

export type GeocodeSuccess = {
  success: true
  latitude: number
  longitude: number
  displayName: string
}

export type GeocodeFailure = {
  success: false
  reason: string
}

export type GeocodeResult = GeocodeSuccess | GeocodeFailure

const PLACEHOLDER_PATTERN = /^(n\/a|na|none|tbd|unknown|no address|not provided|-+|\.)$/i

type CacheEntry = {
  result: GeocodeResult
  expiresAt: number
}

const geocodeCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000

const FETCH_OPTIONS: RequestInit = {
  cache: 'no-store',
}

export function normalizeGeocodeAddressKey(address: string) {
  return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeAddressKey(address: string) {
  return normalizeGeocodeAddressKey(address)
}

export const DEFAULT_GEOCODE_CONCURRENCY = 5

function censusZip(zip: string) {
  return zip.split('-')[0].trim()
}

function stateNameForCode(code: string) {
  return US_STATES.find((state) => state.code === code)?.name || code
}

export function validateAddressFormat(address?: string | null): GeocodeFailure | null {
  const trimmed = address?.trim()

  if (!trimmed) {
    return { success: false, reason: 'Address is missing' }
  }

  if (trimmed.length < 5) {
    return { success: false, reason: 'Address is too short' }
  }

  if (trimmed.length > 300) {
    return { success: false, reason: 'Address is too long' }
  }

  if (PLACEHOLDER_PATTERN.test(trimmed)) {
    return { success: false, reason: 'Address is not a real location' }
  }

  return null
}

function readCache(cacheKey: string): GeocodeResult | null {
  const cached = geocodeCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }
  return null
}

function writeCache(cacheKey: string, result: GeocodeResult, ttl = CACHE_TTL_MS) {
  geocodeCache.set(cacheKey, { result, expiresAt: Date.now() + ttl })
}

async function geocodeWithCensusStructured(
  address: StructuredAddress
): Promise<GeocodeSuccess | null> {
  try {
    const params = new URLSearchParams({
      street: formatStreetLine(address),
      city: address.city,
      state: address.state,
      zip: censusZip(address.zip),
      benchmark: 'Public_AR_Current',
      format: 'json',
    })

    const response = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/address?${params}`,
      FETCH_OPTIONS
    )

    if (!response.ok) return null

    const data = await response.json()
    const match = data?.result?.addressMatches?.[0]
    if (!match?.coordinates) return null

    const longitude = Number(match.coordinates.x)
    const latitude = Number(match.coordinates.y)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null

    return {
      success: true,
      latitude,
      longitude,
      displayName: match.matchedAddress || formatAddressForDisplay(address),
    }
  } catch {
    return null
  }
}

async function geocodeWithCensusOneline(query: string): Promise<GeocodeSuccess | null> {
  try {
    const params = new URLSearchParams({
      address: query,
      benchmark: 'Public_AR_Current',
      format: 'json',
    })

    const response = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`,
      FETCH_OPTIONS
    )

    if (!response.ok) return null

    const data = await response.json()
    const match = data?.result?.addressMatches?.[0]
    if (!match?.coordinates) return null

    const longitude = Number(match.coordinates.x)
    const latitude = Number(match.coordinates.y)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null

    return {
      success: true,
      latitude,
      longitude,
      displayName: match.matchedAddress || query,
    }
  } catch {
    return null
  }
}

async function geocodeWithNominatim(query: string): Promise<GeocodeSuccess | null> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '1',
      countrycodes: 'us',
    })

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        ...FETCH_OPTIONS,
        headers: {
          'User-Agent': 'ServicePortal/1.0 (dashboard-map)',
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok) return null

    const data = (await response.json()) as Array<{
      lat: string
      lon: string
      display_name: string
    }>

    if (!data.length) return null

    const latitude = parseFloat(data[0].lat)
    const longitude = parseFloat(data[0].lon)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

    return {
      success: true,
      latitude,
      longitude,
      displayName: data[0].display_name,
    }
  } catch {
    return null
  }
}

async function geocodeWithPhoton(query: string): Promise<GeocodeSuccess | null> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: '1',
      lang: 'en',
    })

    const response = await fetch(`https://photon.komoot.io/api/?${params}`, FETCH_OPTIONS)
    if (!response.ok) return null

    const data = await response.json()
    const feature = data?.features?.[0]
    const [longitude, latitude] = feature?.geometry?.coordinates || []

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null

    const props = feature.properties || {}
    const parts = [
      props.housenumber,
      props.street,
      props.city,
      props.state,
      props.postcode,
    ].filter(Boolean)

    return {
      success: true,
      latitude,
      longitude,
      displayName: parts.join(', ') || query,
    }
  } catch {
    return null
  }
}

async function geocodeWithProviders(queries: string[]): Promise<GeocodeResult> {
  const uniqueQueries = [...new Set(queries.map((q) => q.trim()).filter(Boolean))]

  for (const query of uniqueQueries) {
    const cacheKey = normalizeAddressKey(query)
    const cached = readCache(cacheKey)
    if (cached?.success) return cached

    const attempts = [
      () => geocodeWithCensusOneline(query),
      () => geocodeWithNominatim(query),
      () => geocodeWithPhoton(query),
    ]

    for (const attempt of attempts) {
      const result = await attempt()
      if (result) {
        writeCache(cacheKey, result)
        return result
      }
    }
  }

  return {
    success: false,
    reason: 'Address could not be found on the map',
  }
}

export async function geocodeStructuredAddress(
  address: StructuredAddress
): Promise<GeocodeResult> {
  if (!hasCompleteStructuredAddress(address)) {
    return { success: false, reason: 'Company address is incomplete' }
  }

  const display = formatAddressForDisplay(address)
  const cacheKey = `structured:${normalizeAddressKey(display)}`
  const cached = readCache(cacheKey)
  if (cached) return cached

  const censusStructured = await geocodeWithCensusStructured(address)
  if (censusStructured) {
    writeCache(cacheKey, censusStructured)
    return censusStructured
  }

  const queries = [
    formatAddressForGeocoding(address),
    `${formatStreetLine(address)}, ${address.city}, ${stateNameForCode(address.state)} ${censusZip(address.zip)}`,
    display,
  ]

  const result = await geocodeWithProviders(queries)
  writeCache(cacheKey, result)
  if (!result.success) {
    return {
      success: false,
      reason: `Could not locate "${display}" on the map. Double-check the street name and ZIP code.`,
    }
  }
  return result
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const formatError = validateAddressFormat(address)
  if (formatError) return formatError

  return geocodeWithProviders([address.trim()])
}

export async function geocodeAddresses(
  entries: Array<{ id: string; address: string }>,
  options?: { concurrency?: number }
): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>()
  const concurrency = Math.max(1, options?.concurrency ?? DEFAULT_GEOCODE_CONCURRENCY)

  for (let index = 0; index < entries.length; index += concurrency) {
    const chunk = entries.slice(index, index + concurrency)
    const chunkResults = await Promise.all(
      chunk.map(async (entry) => ({
        id: entry.id,
        result: await geocodeAddress(entry.address),
      }))
    )

    for (const { id, result } of chunkResults) {
      results.set(id, result)
    }
  }

  return results
}