/**
 * Single-crew / single-day route optimization: visit order + time packing.
 * Used by My Day and Route Planner (P3).
 */

export type RouteOptimizeStop = {
  id: string
  latitude: number
  longitude: number
  startTime: string
  endTime: string
  status: string
}

export type PackedScheduleSlot = {
  id: string
  startTime: string
  endTime: string
}

const MIN_DURATION_MINUTES = 15

/** Jobs that may be reordered and repacked (scheduled only). */
export function getMovableOptimizeStops(stops: RouteOptimizeStop[]): RouteOptimizeStop[] {
  return stops.filter(
    (stop) =>
      stop.status === 'scheduled' &&
      Number.isFinite(stop.latitude) &&
      Number.isFinite(stop.longitude)
  )
}

export function canOptimizeCrewDay(stops: RouteOptimizeStop[]): boolean {
  return getMovableOptimizeStops(stops).length >= 2
}

export function jobDurationMinutes(startTime: string, endTime: string): number {
  const startMs = new Date(startTime).getTime()
  const endMs = new Date(endTime).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return MIN_DURATION_MINUTES
  }
  return Math.max(MIN_DURATION_MINUTES, Math.round((endMs - startMs) / 60_000))
}

/** Haversine distance in meters (for nearest-neighbor fallback). */
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const r = 6_371_000
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Nearest-neighbor tour order (ids). Optional start is usually the company depot.
 * Does not return to start.
 */
export function nearestNeighborOrder(
  stops: Array<{ id: string; latitude: number; longitude: number }>,
  start?: { latitude: number; longitude: number } | null
): string[] {
  if (stops.length === 0) return []
  if (stops.length === 1) return [stops[0].id]

  const remaining = new Map(stops.map((s) => [s.id, s]))
  const order: string[] = []

  let current: { latitude: number; longitude: number } =
    start && Number.isFinite(start.latitude) && Number.isFinite(start.longitude)
      ? start
      : stops[0]

  // If no depot, seed with first stop then remove it
  if (!start || !Number.isFinite(start.latitude) || !Number.isFinite(start.longitude)) {
    const first = stops[0]
    order.push(first.id)
    remaining.delete(first.id)
    current = first
  }

  while (remaining.size > 0) {
    let bestId: string | null = null
    let bestDist = Infinity
    for (const stop of remaining.values()) {
      const d = haversineMeters(current, stop)
      if (d < bestDist) {
        bestDist = d
        bestId = stop.id
      }
    }
    if (!bestId) break
    const next = remaining.get(bestId)!
    order.push(bestId)
    remaining.delete(bestId)
    current = next
  }

  return order
}

/**
 * Apply an explicit order of original indices (from OSRM trip) to stop ids.
 * Falls back to identity order when indices are invalid.
 */
export function orderIdsByIndices(ids: string[], indices: number[]): string[] {
  if (ids.length === 0) return []
  if (
    indices.length !== ids.length ||
    new Set(indices).size !== ids.length ||
    indices.some((i) => !Number.isInteger(i) || i < 0 || i >= ids.length)
  ) {
    return [...ids]
  }
  return indices.map((i) => ids[i])
}

/**
 * Pack movable jobs in visit order, preserving each job's duration and inserting
 * the company travel buffer between stops. Starts at the earliest original start
 * among the ordered jobs (or `dayStartIso` when provided).
 */
export function packJobsInOrder(
  jobs: Array<{ id: string; startTime: string; endTime: string }>,
  orderedIds: string[],
  options: {
    travelBufferMinutes: number
    dayStartIso?: string
  }
): PackedScheduleSlot[] {
  const byId = new Map(jobs.map((j) => [j.id, j]))
  const ordered = orderedIds
    .map((id) => byId.get(id))
    .filter((j): j is { id: string; startTime: string; endTime: string } => Boolean(j))

  if (ordered.length === 0) return []

  const bufferMs = Math.max(0, Math.round(options.travelBufferMinutes)) * 60_000

  let cursorMs: number
  if (options.dayStartIso) {
    cursorMs = new Date(options.dayStartIso).getTime()
  } else {
    cursorMs = Math.min(...ordered.map((j) => new Date(j.startTime).getTime()))
  }

  if (!Number.isFinite(cursorMs)) {
    cursorMs = Date.now()
  }

  const packed: PackedScheduleSlot[] = []

  for (const job of ordered) {
    const durationMs = jobDurationMinutes(job.startTime, job.endTime) * 60_000
    const startTime = new Date(cursorMs).toISOString()
    const endTime = new Date(cursorMs + durationMs).toISOString()
    packed.push({ id: job.id, startTime, endTime })
    cursorMs = cursorMs + durationMs + bufferMs
  }

  return packed
}

/**
 * Full pure optimize pipeline given an order of stop ids (from OSRM or NN).
 */
export function buildOptimizedSchedule(
  stops: RouteOptimizeStop[],
  orderedIds: string[],
  travelBufferMinutes: number
): PackedScheduleSlot[] {
  const movable = getMovableOptimizeStops(stops)
  const movableIds = new Set(movable.map((s) => s.id))
  const filteredOrder = orderedIds.filter((id) => movableIds.has(id))

  // Include any movable stops missing from order (append in original time order)
  const orderedSet = new Set(filteredOrder)
  for (const stop of [...movable].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )) {
    if (!orderedSet.has(stop.id)) {
      filteredOrder.push(stop.id)
      orderedSet.add(stop.id)
    }
  }

  return packJobsInOrder(movable, filteredOrder, { travelBufferMinutes })
}
