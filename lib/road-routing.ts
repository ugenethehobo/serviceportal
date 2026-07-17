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

type OsrmTripResponse = {
  code: string
  waypoints?: Array<{
    waypoint_index?: number
    trips_index?: number
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

/**
 * OSRM trip service: optimize visit order for driving.
 * Returns permutation of job indices (0..n-1). When `startCoordinate` is set,
 * that point is fixed as the tour start (depot) and is not included in the result.
 */
export async function getTripOptimizedJobOrder(input: {
  jobCoordinates: [number, number][]
  startCoordinate?: [number, number] | null
}): Promise<number[] | null> {
  const jobs = input.jobCoordinates.filter(isValidCoordinate)
  if (jobs.length < 2) return null

  const start =
    input.startCoordinate && isValidCoordinate(input.startCoordinate)
      ? input.startCoordinate
      : null

  const waypoints = start ? [start, ...jobs] : jobs
  const coordinatePath = waypoints.map(formatWaypoint).join(';')
  const params = start
    ? 'source=first&roundtrip=false&overview=false'
    : 'roundtrip=false&overview=false'
  const url = `${OSRM_BASE_URL}/trip/v1/driving/${coordinatePath}?${params}`

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) return null

    const data = (await response.json()) as OsrmTripResponse
    if (data.code !== 'Ok' || !data.waypoints?.length) return null

    // waypoints[] is in input order; waypoint_index is position in the trip.
    const withIndex = data.waypoints.map((wp, inputIndex) => ({
      inputIndex,
      tripIndex: typeof wp.waypoint_index === 'number' ? wp.waypoint_index : inputIndex,
    }))

    withIndex.sort((a, b) => a.tripIndex - b.tripIndex)

    if (start) {
      // Drop depot (input index 0); remap remaining to job indices (input - 1)
      const jobOrder = withIndex
        .filter((entry) => entry.inputIndex > 0)
        .map((entry) => entry.inputIndex - 1)
      if (jobOrder.length !== jobs.length) return null
      if (new Set(jobOrder).size !== jobs.length) return null
      return jobOrder
    }

    const order = withIndex.map((entry) => entry.inputIndex)
    if (order.length !== jobs.length) return null
    if (new Set(order).size !== jobs.length) return null
    return order
  } catch {
    return null
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