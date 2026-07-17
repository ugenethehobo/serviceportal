'use server'

import { revalidatePath } from 'next/cache'
import { CREW_ASSIGNABLE_ROLES } from '@/lib/company-operations'
import {
  canManageJobHelpers,
  filterHelperCandidates,
  normalizeHelperProfileIds,
  type JobHelperPerson,
  MAX_JOB_HELPERS,
} from '@/lib/job-helpers'
import {
  createSupabaseAdmin,
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'

async function loadLeadCrewIds(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  companyId: string,
  userId: string
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('crews')
    .select('id')
    .eq('company_id', companyId)
    .eq('crew_lead_id', userId)

  return (data || []).map((row) => row.id)
}

async function isProfileHelperOnJob(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  scheduleId: string,
  profileId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('schedule_helpers')
    .select('id')
    .eq('schedule_id', scheduleId)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error) {
    // Table missing in env that has not run migration yet
    if (error.code === '42P01') return false
    throw error
  }
  return Boolean(data)
}

export async function isUserHelperOnSchedule(
  scheduleId: string,
  profileId: string
): Promise<boolean> {
  const supabaseAdmin = createSupabaseAdmin()
  try {
    return await isProfileHelperOnJob(supabaseAdmin, scheduleId, profileId)
  } catch {
    return false
  }
}

export async function getJobHelpersAction(
  jobId: string,
  clientId: string
): Promise<
  | {
      success: true
      helpers: JobHelperPerson[]
      canManage: boolean
      candidates: JobHelperPerson[]
      maxHelpers: number
    }
  | { success: false; error: string }
> {
  try {
    const session = await getSessionProfile()
    if (!session?.profile?.company_id) {
      return { success: false, error: 'Not authenticated' }
    }
    if (!isStaffRole(session.profile.role)) {
      return { success: false, error: 'Unauthorized' }
    }

    const companyId = session.profile.company_id
    const subscription = await verifyStaffSubscriptionAccess(companyId)
    if (!subscription.ok) {
      return { success: false, error: TRIAL_EXPIRED_ERROR }
    }

    const supabaseAdmin = createSupabaseAdmin()

    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id, company_id')
      .eq('id', clientId)
      .maybeSingle()

    if (!client || client.company_id !== companyId) {
      return { success: false, error: 'Job not found' }
    }

    const { data: schedule } = await supabaseAdmin
      .from('schedules')
      .select('id, crew_id, client_id')
      .eq('id', jobId)
      .eq('client_id', clientId)
      .maybeSingle()

    if (!schedule) {
      return { success: false, error: 'Job not found' }
    }

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('is_solo_business')
      .eq('id', companyId)
      .maybeSingle()

    const isSoloBusiness = Boolean(company?.is_solo_business)

    // Team member ACL: crew or helper
    if (session.profile.role === 'team_member') {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('crew_id')
        .eq('id', session.userId)
        .maybeSingle()

      const isHelper = await isProfileHelperOnJob(
        supabaseAdmin,
        jobId,
        session.userId
      )
      const { canTeamMemberAccessJob } = await import('@/lib/job-helpers')
      if (
        !canTeamMemberAccessJob({
          jobCrewId: schedule.crew_id,
          memberCrewId: profile?.crew_id ?? null,
          isHelper,
        })
      ) {
        return { success: false, error: 'Job not found' }
      }
    }

    const leadCrewIds =
      session.profile.role === 'team_member'
        ? await loadLeadCrewIds(supabaseAdmin, companyId, session.userId)
        : []

    const canManage = canManageJobHelpers({
      role: session.profile.role,
      isSoloBusiness,
      jobCrewId: schedule.crew_id,
      leadCrewIds,
    })

    let helpers: JobHelperPerson[] = []
    const { data: helperRows, error: helperError } = await supabaseAdmin
      .from('schedule_helpers')
      .select(
        `
        profile_id,
        profile:profiles!profile_id (
          id,
          full_name,
          avatar_url,
          crew_id
        )
      `
      )
      .eq('schedule_id', jobId)

    if (helperError) {
      if (helperError.code !== '42P01') {
        return { success: false, error: helperError.message }
      }
    } else {
      const mapped: JobHelperPerson[] = []
      for (const row of helperRows || []) {
        const profileRaw = row.profile
        const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
        if (!profile?.id) continue
        mapped.push({
          id: profile.id as string,
          fullName: (profile.full_name as string) || 'Team member',
          avatarUrl: (profile.avatar_url as string | null) ?? null,
          crewId: (profile.crew_id as string | null) ?? null,
        })
      }
      helpers = mapped.sort((a, b) => a.fullName.localeCompare(b.fullName))
    }

    let candidates: JobHelperPerson[] = []
    if (canManage && !isSoloBusiness) {
      const { data: staff } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, avatar_url, crew_id, role')
        .eq('company_id', companyId)
        .in('role', [...CREW_ASSIGNABLE_ROLES])

      candidates = filterHelperCandidates(staff || [], {
        isSoloBusiness,
        excludeProfileIds: [],
      })
    }

    return {
      success: true,
      helpers,
      canManage,
      candidates,
      maxHelpers: MAX_JOB_HELPERS,
    }
  } catch (error: unknown) {
    console.error('getJobHelpersAction error:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to load helpers'
    return { success: false, error: message }
  }
}

export async function setJobHelpersAction(input: {
  jobId: string
  clientId: string
  helperProfileIds: string[]
}): Promise<
  { success: true; helpers: JobHelperPerson[] } | { success: false; error: string }
> {
  try {
    const session = await getSessionProfile()
    if (!session?.profile?.company_id) {
      return { success: false, error: 'Not authenticated' }
    }
    if (!isStaffRole(session.profile.role)) {
      return { success: false, error: 'Unauthorized' }
    }

    const companyId = session.profile.company_id
    const subscription = await verifyStaffSubscriptionAccess(companyId)
    if (!subscription.ok) {
      return { success: false, error: TRIAL_EXPIRED_ERROR }
    }

    const supabaseAdmin = createSupabaseAdmin()

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('is_solo_business')
      .eq('id', companyId)
      .maybeSingle()

    if (company?.is_solo_business) {
      return {
        success: false,
        error: 'Helpers are not used in solo business mode',
      }
    }

    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id, company_id')
      .eq('id', input.clientId)
      .maybeSingle()

    if (!client || client.company_id !== companyId) {
      return { success: false, error: 'Job not found' }
    }

    const { data: schedule } = await supabaseAdmin
      .from('schedules')
      .select('id, crew_id, client_id, status')
      .eq('id', input.jobId)
      .eq('client_id', input.clientId)
      .maybeSingle()

    if (!schedule) {
      return { success: false, error: 'Job not found' }
    }

    if (schedule.status === 'cancelled') {
      return { success: false, error: 'Cannot edit helpers on a cancelled job' }
    }

    const leadCrewIds =
      session.profile.role === 'team_member'
        ? await loadLeadCrewIds(supabaseAdmin, companyId, session.userId)
        : []

    if (
      !canManageJobHelpers({
        role: session.profile.role,
        isSoloBusiness: false,
        jobCrewId: schedule.crew_id,
        leadCrewIds,
      })
    ) {
      return {
        success: false,
        error: schedule.crew_id
          ? 'Only company admins or the crew lead can assign helpers'
          : 'Assign a crew before adding helpers',
      }
    }

    const helperIds = normalizeHelperProfileIds(input.helperProfileIds)

    if (helperIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, company_id, role')
        .in('id', helperIds)

      if (profilesError) {
        return { success: false, error: profilesError.message }
      }

      const valid = new Set(
        (profiles || [])
          .filter(
            (p) =>
              p.company_id === companyId &&
              CREW_ASSIGNABLE_ROLES.includes(
                p.role as (typeof CREW_ASSIGNABLE_ROLES)[number]
              )
          )
          .map((p) => p.id)
      )

      if (valid.size !== helperIds.length) {
        return {
          success: false,
          error: 'One or more helpers are not valid team members',
        }
      }
    }

    // Replace set
    const { error: deleteError } = await supabaseAdmin
      .from('schedule_helpers')
      .delete()
      .eq('schedule_id', input.jobId)

    if (deleteError) {
      if (deleteError.code === '42P01') {
        return {
          success: false,
          error:
            'Helpers table is not set up. Run supabase/schedule-helpers-schema.sql',
        }
      }
      return { success: false, error: deleteError.message }
    }

    if (helperIds.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('schedule_helpers')
        .insert(
          helperIds.map((profile_id) => ({
            schedule_id: input.jobId,
            profile_id,
          }))
        )

      if (insertError) {
        return { success: false, error: insertError.message }
      }
    }

    revalidatePath(`/dashboard/clients/${input.clientId}/jobs/${input.jobId}`)
    revalidatePath('/dashboard/team')
    revalidatePath('/dashboard/crews')
    revalidatePath('/dashboard/schedule')

    const refreshed = await getJobHelpersAction(input.jobId, input.clientId)
    if (!refreshed.success) {
      return { success: true, helpers: [] }
    }

    return { success: true, helpers: refreshed.helpers }
  } catch (error: unknown) {
    console.error('setJobHelpersAction error:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to save helpers'
    return { success: false, error: message }
  }
}

/** Used by field ACL and My Day — exported for server modules. */
export async function fetchHelperScheduleIdsForProfile(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  profileId: string
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('schedule_helpers')
    .select('schedule_id')
    .eq('profile_id', profileId)

  if (error) {
    if (error.code === '42P01') return []
    throw error
  }
  return (data || []).map((row) => row.schedule_id as string)
}

export async function fetchHelperCountsBySchedule(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  scheduleIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (scheduleIds.length === 0) return map

  const { data, error } = await supabaseAdmin
    .from('schedule_helpers')
    .select('schedule_id')
    .in('schedule_id', scheduleIds)

  if (error) {
    if (error.code === '42P01') return map
    throw error
  }

  for (const row of data || []) {
    const id = row.schedule_id as string
    map.set(id, (map.get(id) || 0) + 1)
  }
  return map
}

export async function fetchLeadCrewIdsForUser(
  companyId: string,
  userId: string
): Promise<string[]> {
  const supabaseAdmin = createSupabaseAdmin()
  return loadLeadCrewIds(supabaseAdmin, companyId, userId)
}
