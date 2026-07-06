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

type ScheduleWithCrew = {
  id: string
  crew_id: string | null
  status: string
  start_time: string
  end_time: string
  crew?: { id: string; name: string } | null
}

/** Marks schedules that overlap another job on the same crew (in-memory, no N+1 queries). */
export function attachCrewConflictFlags<T extends ScheduleWithCrew>(schedules: T[]) {
  const active = schedules.filter(
    (schedule) => schedule.status !== 'archived' && schedule.crew?.id
  )

  return schedules.map((schedule) => {
    if (!schedule.crew?.id || schedule.status === 'archived') {
      return { ...schedule, hasCrewConflict: false }
    }

    const hasCrewConflict = active.some(
      (other) =>
        other.id !== schedule.id &&
        other.crew?.id === schedule.crew?.id &&
        other.start_time <= schedule.end_time &&
        other.end_time >= schedule.start_time
    )

    return { ...schedule, hasCrewConflict }
  })
}