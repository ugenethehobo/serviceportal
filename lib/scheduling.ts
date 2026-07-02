import { createClient } from '@supabase/supabase-js'

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
// CORE SCHEDULING ENGINE - Phase 1
// ============================================

/**
 * Get all jobs for a crew that overlap with a given time window
 */
 export async function getCrewConflictingSchedules(
   crewId: string,
   startTime: string | Date,
   endTime: string | Date
 ) {
   const { data, error } = await supabaseAdmin
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
     .lte('start_time', endTime)
     .gte('end_time', startTime)

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
  endTime: string | Date
): Promise<boolean> {
  const conflictingJobs = await getCrewConflictingSchedules(crewId, startTime, endTime)
  return conflictingJobs.length === 0
}

/**
 * Get all available crews for a company during a time window
 */
export async function getAvailableCrews(
  companyId: string,
  startTime: string | Date,
  endTime: string | Date
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
    const isAvailable = await isCrewAvailable(crew.id, startTime, endTime)
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
  excludeCrewId?: string
) {
  const available = await getAvailableCrews(companyId, startTime, endTime)

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
  endTime: string | Date
): Promise<{ hasConflict: boolean; conflictingJobs: any[] }> {
  if (!crewId) {
    return { hasConflict: false, conflictingJobs: [] }
  }

  const conflictingJobs = await getCrewConflictingSchedules(crewId, startTime, endTime)

  return {
    hasConflict: conflictingJobs.length > 0,
    conflictingJobs,
  }
}
