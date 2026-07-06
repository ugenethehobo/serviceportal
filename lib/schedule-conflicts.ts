/** True when two windows conflict, optionally requiring buffer minutes between them. */
export function schedulesOverlapWithBuffer(
  aStart: string | Date,
  aEnd: string | Date,
  bStart: string | Date,
  bEnd: string | Date,
  bufferMinutes = 0
): boolean {
  const bufferMs = Math.max(0, bufferMinutes) * 60 * 1000
  const aStartMs = new Date(aStart).getTime() - bufferMs
  const aEndMs = new Date(aEnd).getTime() + bufferMs
  const bStartMs = new Date(bStart).getTime()
  const bEndMs = new Date(bEnd).getTime()
  return bStartMs < aEndMs && bEndMs > aStartMs
}

export function expandWindowWithBuffer(
  startTime: string | Date,
  endTime: string | Date,
  bufferMinutes = 0
) {
  const bufferMs = Math.max(0, bufferMinutes) * 60 * 1000
  return {
    startIso: new Date(new Date(startTime).getTime() - bufferMs).toISOString(),
    endIso: new Date(new Date(endTime).getTime() + bufferMs).toISOString(),
  }
}