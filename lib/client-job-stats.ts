import { OPEN_JOB_STATUSES } from '@/lib/billing'

type ClientScheduleRow = {
  status: string
  end_time: string
}

/** Open jobs that have not ended yet (scheduled or in progress). */
export function countActiveClientJobs(
  schedules: ClientScheduleRow[],
  now: Date = new Date()
): number {
  const nowMs = now.getTime()
  return schedules.filter((schedule) => {
    if (!OPEN_JOB_STATUSES.includes(schedule.status as (typeof OPEN_JOB_STATUSES)[number])) {
      return false
    }
    return new Date(schedule.end_time).getTime() > nowMs
  }).length
}