type OsrmRouteResponse = {
  code: string
  routes?: Array<{
    distance: number
    duration: number
    geometry: {
      type: string
      coordinates: [number, number][]
    }
  }>
  message?: string
}

export type RoadRouteResult = {
  coordinates: [number, number][]
  distanceMeters: number | null
  durationSeconds: number | null
  followsRoads: boolean
}

const OSRM_BASE_URL =
  process.env.OSRM_BASE_URL?.replace(/\/$/, '') ||
  'https://router.project-osrm.org'

function formatWaypoint([lng, lat]: [number, number]) {
  return `${lng},${lat}`
}

function isValidCoordinate([lng, lat]: [number, number]) {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  )
}

/** Fetch a driving route that follows roads through waypoints in order. */
export async function getRoadRouteCoordinates(
  waypoints: [number, number][]
): Promise<RoadRouteResult> {
  const validWaypoints = waypoints.filter(isValidCoordinate)

  if (validWaypoints.length < 2) {
    return {
      coordinates: validWaypoints,
      distanceMeters: null,
      durationSeconds: null,
      followsRoads: false,
    }
  }

  const coordinatePath = validWaypoints.map(formatWaypoint).join(';')
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coordinatePath}?overview=full&geometries=geojson&steps=false`

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      return fallbackRoute(validWaypoints)
    }

    const data = (await response.json()) as OsrmRouteResponse

    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates?.length) {
      return fallbackRoute(validWaypoints)
    }

    const route = data.routes[0]
    const coordinates = route.geometry.coordinates.filter(isValidCoordinate)

    if (coordinates.length < 2) {
      return fallbackRoute(validWaypoints)
    }

    return {
      coordinates,
      distanceMeters: route.distance ?? null,
      durationSeconds: route.duration ?? null,
      followsRoads: true,
    }
  } catch {
    return fallbackRoute(validWaypoints)
  }
}

function fallbackRoute(waypoints: [number, number][]): RoadRouteResult {
  return {
    coordinates: waypoints,
    distanceMeters: null,
    durationSeconds: null,
    followsRoads: false,
  }
}

export function formatRouteDistance(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters)) return null
  const miles = meters / 1609.344
  if (miles < 0.1) return '< 0.1 mi'
  return `${miles.toFixed(1)} mi`
}

export function formatRouteDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 1) return '< 1 min'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}