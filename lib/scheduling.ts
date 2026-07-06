import { createClient } from '@supabase/supabase-js'
import {
  expandWindowWithBuffer,
  schedulesOverlapWithBuffer,
} from '@/lib/schedule-conflicts'

export { schedulesOverlapWithBuffer } from '@/lib/schedule-conflicts'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

// ============================================
// CORE SCHEDULING ENGINE
// ============================================

export type SchedulingConflictOptions = {
  bufferMinutes?: number
  excludeScheduleId?: string
}

/**
 * Get all jobs for a crew that overlap with a given time window
 */
 export async function getCrewConflictingSchedules(
   crewId: string,
   startTime: string | Date,
   endTime: string | Date,
   options?: SchedulingConflictOptions
 ) {
   const window = expandWindowWithBuffer(startTime, endTime, options?.bufferMinutes ?? 0)
   let query = supabaseAdmin
     .from('schedules')
     .select(`
       id,
       title,
       start_time,
       end_time,
       status,
       clients (name)
     `)
     .eq('crew_id', crewId)
     .neq('status', 'cancelled')
     .neq('status', 'archived')
     .lte('start_time', window.endIso)
     .gte('end_time', window.startIso)

   if (options?.excludeScheduleId) {
     query = query.neq('id', options.excludeScheduleId)
   }

   const { data, error } = await query

   if (error) {
     console.error('Error fetching conflicting schedules:', error)
     return []
   }

   return data || []
 }

/**
 * Check if a crew is available during a specific time window
 */
export async function isCrewAvailable(
  crewId: string,
  startTime: string | Date,
  endTime: string | Date,
  options?: SchedulingConflictOptions
): Promise<boolean> {
  const conflictingJobs = await getCrewConflictingSchedules(
    crewId,
    startTime,
    endTime,
    options
  )
  const bufferMinutes = options?.bufferMinutes ?? 0
  return !conflictingJobs.some((job) =>
    schedulesOverlapWithBuffer(
      job.start_time,
      job.end_time,
      startTime,
      endTime,
      bufferMinutes
    )
  )
}

/**
 * Get all available crews for a company during a time window
 */
export async function getAvailableCrews(
  companyId: string,
  startTime: string | Date,
  endTime: string | Date,
  options?: SchedulingConflictOptions
) {
  // Get all crews for the company
  const { data: crews, error } = await supabaseAdmin
    .from('crews')
    .select('id, name')
    .eq('company_id', companyId)

  if (error || !crews) {
    console.error('Error fetching crews:', error)
    return []
  }

  // Check availability for each crew
  const availableCrews = []

  for (const crew of crews) {
    const isAvailable = await isCrewAvailable(crew.id, startTime, endTime, options)
    if (isAvailable) {
      availableCrews.push(crew)
    }
  }

  return availableCrews
}

/**
 * Suggest alternative crews when the selected crew is unavailable
 */
export async function suggestAlternativeCrews(
  companyId: string,
  startTime: string | Date,
  endTime: string | Date,
  excludeCrewId?: string,
  options?: SchedulingConflictOptions
) {
  const available = await getAvailableCrews(companyId, startTime, endTime, options)

  if (excludeCrewId) {
    return available.filter(crew => crew.id !== excludeCrewId)
  }

  return available
}

/**
 * Basic conflict check for a proposed job
 */
export async function checkJobConflict(
  crewId: string | null,
  startTime: string | Date,
  endTime: string | Date,
  options?: SchedulingConflictOptions
): Promise<{ hasConflict: boolean; conflictingJobs: any[] }> {
  if (!crewId) {
    return { hasConflict: false, conflictingJobs: [] }
  }

  const bufferMinutes = options?.bufferMinutes ?? 0
  const conflictingJobs = await getCrewConflictingSchedules(
    crewId,
    startTime,
    endTime,
    options
  )
  const filtered = conflictingJobs.filter((job) =>
    schedulesOverlapWithBuffer(
      job.start_time,
      job.end_time,
      startTime,
      endTime,
      bufferMinutes
    )
  )

  return {
    hasConflict: filtered.length > 0,
    conflictingJobs: filtered,
  }
}
