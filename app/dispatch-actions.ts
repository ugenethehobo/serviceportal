'use server'

import { revalidatePath } from 'next/cache'
import {
  buildDispatchBoardData,
  resolveDispatchTargetCrewId,
  type DispatchBoardData,
  type DispatchViewerMode,
  type RawDispatchSchedule,
} from '@/lib/dispatch-board'
import { canCrewLeadReassignDispatch } from '@/lib/job-helpers'
import {
  createSupabaseAdmin,
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'
import { checkJobConflict } from '@/lib/scheduling'
import {
  formatCompanyDateLabel,
  getCompanyDayBounds,
} from '@/lib/timezone'

type DispatchAccess =
  | {
      ok: true
      companyId: string
      userId: string
      viewerMode: DispatchViewerMode
      leadCrewId: string | null
    }
  | { ok: false; error: string }

async function verifyDispatchAccess(): Promise<DispatchAccess> {
  const session = await getSessionProfile()
  if (!session) {
    return { ok: false, error: 'Not authenticated' }
  }
  if (!session.profile.company_id) {
    return { ok: false, error: 'No company associated with this account' }
  }
  if (!isStaffRole(session.profile.role)) {
    return { ok: false, error: 'Unauthorized' }
  }

  const companyId = session.profile.company_id
  const subscription = await verifyStaffSubscriptionAccess(companyId)
  if (!subscription.ok) {
    return { ok: false, error: TRIAL_EXPIRED_ERROR }
  }

  if (session.profile.role === 'company_admin') {
    return {
      ok: true,
      companyId,
      userId: session.userId,
      viewerMode: 'admin',
      leadCrewId: null,
    }
  }

  // P4: crew leads may use dispatch with limited reassign powers
  const supabaseAdmin = createSupabaseAdmin()
  const { data: leadCrews } = await supabaseAdmin
    .from('crews')
    .select('id')
    .eq('company_id', companyId)
    .eq('crew_lead_id', session.userId)
    .order('created_at', { ascending: true })
    .limit(1)

  const leadCrewId = leadCrews?.[0]?.id ?? null
  if (!leadCrewId) {
    return {
      ok: false,
      error: 'Only company admins or crew leads can use dispatch',
    }
  }

  return {
    ok: true,
    companyId,
    userId: session.userId,
    viewerMode: 'crew_lead',
    leadCrewId,
  }
}

async function getCompanyTravelBufferMinutes(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  companyId: string
) {
  const { data } = await supabaseAdmin
    .from('companies')
    .select('booking_settings')
    .eq('id', companyId)
    .maybeSingle()

  const { normalizeBookingSettings } = await import('@/lib/booking')
  return normalizeBookingSettings(data?.booking_settings).travel_buffer_minutes
}

export async function getDispatchBoardAction(
  dayOffset = 0
): Promise<
  { success: true; data: DispatchBoardData } | { success: false; error: string }
> {
  try {
    const check = await verifyDispatchAccess()
    if (!check.ok) return { success: false, error: check.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('timezone, is_solo_business')
      .eq('id', check.companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Company not found' }
    }

    const timezone = company.timezone || 'America/Chicago'
    const { getCompanySoloContext } = await import('@/lib/solo-business-server')
    const soloContext = await getCompanySoloContext(check.companyId)
    const isSoloBusiness = Boolean(company.is_solo_business) || soloContext.isSoloBusiness

    // Solo mode is admin-owner only
    if (isSoloBusiness && check.viewerMode !== 'admin') {
      return { success: false, error: 'Only the owner can manage solo schedule' }
    }

    const bounds = getCompanyDayBounds(timezone, new Date(), dayOffset)
    const dayLabel = formatCompanyDateLabel(timezone, new Date(), dayOffset)

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('company_id', check.companyId)

    const clientIds = (clients || []).map((client) => client.id)
    let schedules: RawDispatchSchedule[] = []

    if (clientIds.length > 0) {
      const { data: scheduleData, error: scheduleError } = await supabaseAdmin
        .from('schedules')
        .select(
          `
          id,
          title,
          start_time,
          end_time,
          status,
          crew_id,
          client_id,
          client:clients!client_id (
            id,
            name,
            address,
            address_street,
            address_unit,
            address_city,
            address_state,
            address_zip
          )
        `
        )
        .in('client_id', clientIds)
        .neq('status', 'cancelled')
        .lt('start_time', bounds.endIso)
        .gt('end_time', bounds.startIso)
        .order('start_time', { ascending: true })

      if (scheduleError) {
        return { success: false, error: scheduleError.message }
      }

      schedules = (scheduleData || []) as RawDispatchSchedule[]
    }

    const { data: crews, error: crewsError } = await supabaseAdmin
      .from('crews')
      .select('id, name')
      .eq('company_id', check.companyId)
      .order('name', { ascending: true })

    if (crewsError) {
      return { success: false, error: crewsError.message }
    }

    const { fetchHelperCountsBySchedule } = await import('@/app/job-helpers-actions')
    const helperCounts = await fetchHelperCountsBySchedule(
      supabaseAdmin,
      schedules.map((s) => s.id)
    )

    const data = buildDispatchBoardData({
      schedules,
      crews: crews || [],
      dayOffset,
      dayLabel,
      dateStr: bounds.dateStr,
      timezone,
      isSoloBusiness,
      soloCrewId: soloContext.soloCrewId,
      helperCounts,
      viewerMode: check.viewerMode,
      leadCrewId: check.leadCrewId,
    })

    return { success: true, data }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load dispatch board'
    console.error('getDispatchBoardAction error:', error)
    return { success: false, error: message }
  }
}

export async function reassignDispatchJobAction(input: {
  jobId: string
  clientId: string
  /** Column id: 'unassigned' or crew uuid */
  targetColumnId: string
}): Promise<
  | { success: true }
  | { success: false; error: string; suggestedCrewIds?: string[] }
> {
  try {
    const check = await verifyDispatchAccess()
    if (!check.ok) return { success: false, error: check.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { getCompanySoloContext } = await import('@/lib/solo-business-server')
    const soloContext = await getCompanySoloContext(check.companyId)

    const { data: schedule, error: scheduleError } = await supabaseAdmin
      .from('schedules')
      .select('id, client_id, start_time, end_time, status, crew_id, title')
      .eq('id', input.jobId)
      .single()

    if (scheduleError || !schedule) {
      return { success: false, error: 'Job not found' }
    }

    if (schedule.client_id !== input.clientId) {
      return { success: false, error: 'Job does not match client' }
    }

    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id, company_id')
      .eq('id', input.clientId)
      .single()

    if (!client || client.company_id !== check.companyId) {
      return { success: false, error: 'Unauthorized' }
    }

    if (schedule.status === 'archived' || schedule.status === 'cancelled') {
      return { success: false, error: 'Cannot reassign archived or cancelled jobs' }
    }

    let targetCrewId = resolveDispatchTargetCrewId(input.targetColumnId, {
      isSoloBusiness: soloContext.isSoloBusiness,
      soloCrewId: soloContext.soloCrewId,
    })

    if (soloContext.isSoloBusiness) {
      if (targetCrewId && soloContext.soloCrewId && targetCrewId !== soloContext.soloCrewId) {
        return { success: false, error: 'Solo mode can only assign jobs to you' }
      }
      if (targetCrewId === null && input.targetColumnId !== 'unassigned') {
        targetCrewId = soloContext.soloCrewId
      }
    }

    // P4 crew lead: only unassigned ↔ their crew
    if (check.viewerMode === 'crew_lead') {
      if (!check.leadCrewId) {
        return { success: false, error: 'Crew lead assignment not found' }
      }
      if (
        !canCrewLeadReassignDispatch({
          leadCrewId: check.leadCrewId,
          sourceCrewId: schedule.crew_id,
          targetCrewId,
        })
      ) {
        return {
          success: false,
          error: 'Crew leads can only assign jobs to their own crew or unassigned',
        }
      }
    }

    if (targetCrewId === schedule.crew_id || (!targetCrewId && !schedule.crew_id)) {
      return { success: true }
    }

    if (targetCrewId) {
      const { data: crew } = await supabaseAdmin
        .from('crews')
        .select('id, company_id')
        .eq('id', targetCrewId)
        .single()

      if (!crew || crew.company_id !== check.companyId) {
        return { success: false, error: 'Crew not found' }
      }

      const bufferMinutes = await getCompanyTravelBufferMinutes(supabaseAdmin, check.companyId)
      const conflict = await checkJobConflict(
        targetCrewId,
        schedule.start_time,
        schedule.end_time,
        { bufferMinutes, excludeScheduleId: input.jobId }
      )

      if (conflict.hasConflict) {
        return {
          success: false,
          error: soloContext.isSoloBusiness
            ? 'That time overlaps another job on your schedule'
            : 'That crew already has a job at this time',
        }
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('schedules')
      .update({ crew_id: targetCrewId })
      .eq('id', input.jobId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    try {
      const { queueGoogleCalendarSync } = await import('@/lib/google-calendar-sync')
      await queueGoogleCalendarSync(supabaseAdmin, input.jobId)
    } catch {
      // non-blocking
    }

    revalidatePath('/dashboard/crews')
    revalidatePath('/dashboard/schedule')
    revalidatePath(`/dashboard/clients/${input.clientId}`)
    revalidatePath(`/dashboard/clients/${input.clientId}/jobs/${input.jobId}`)
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/team')

    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reassign job'
    console.error('reassignDispatchJobAction error:', error)
    return { success: false, error: message }
  }
}
