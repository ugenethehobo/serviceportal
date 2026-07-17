'use server'

import { revalidatePath } from 'next/cache'
import {
  getAvailableFieldJobAction,
  getFieldJobSuccessMessage,
  getFieldJobTargetStatus,
  type FieldJobAction,
} from '@/lib/field-job-access'
import {
  createSupabaseAdmin,
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'

async function verifyFieldJobAccess(jobId: string, clientId: string) {
  const session = await getSessionProfile()
  if (!session) {
    return { ok: false as const, error: 'Not authenticated' }
  }
  if (!session.profile.company_id) {
    return { ok: false as const, error: 'No company associated with this account' }
  }
  if (!isStaffRole(session.profile.role)) {
    return { ok: false as const, error: 'Unauthorized' }
  }

  const subscription = await verifyStaffSubscriptionAccess(session.profile.company_id)
  if (!subscription.ok) {
    return { ok: false as const, error: TRIAL_EXPIRED_ERROR }
  }

  const supabaseAdmin = createSupabaseAdmin()

  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, company_id, name')
    .eq('id', clientId)
    .maybeSingle()

  if (!client || client.company_id !== session.profile.company_id) {
    return { ok: false as const, error: 'Job not found' }
  }

  const { data: schedule } = await supabaseAdmin
    .from('schedules')
    .select(
      'id, client_id, crew_id, title, status, start_time, end_time, recurring_rule_id, description, price'
    )
    .eq('id', jobId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!schedule) {
    return { ok: false as const, error: 'Job not found' }
  }

  // Team members: crew jobs or helper assignments (P4)
  if (session.profile.role === 'team_member') {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('crew_id')
      .eq('id', session.userId)
      .maybeSingle()

    const { isUserHelperOnSchedule } = await import('@/app/job-helpers-actions')
    const isHelper = await isUserHelperOnSchedule(jobId, session.userId)
    const { canTeamMemberAccessCrewJob } = await import('@/lib/field-job-access')
    if (
      !canTeamMemberAccessCrewJob(
        schedule.crew_id,
        profile?.crew_id ?? null,
        isHelper
      )
    ) {
      return { ok: false as const, error: 'Job not found' }
    }
  }

  return {
    ok: true as const,
    session,
    companyId: session.profile.company_id,
    schedule,
    clientName: client.name as string | null,
    supabaseAdmin,
  }
}

async function applyFieldJobAction(
  jobId: string,
  clientId: string,
  action: FieldJobAction
): Promise<{ success: true; status: string } | { success: false; error: string }> {
  try {
    const access = await verifyFieldJobAccess(jobId, clientId)
    if (!access.ok) return { success: false, error: access.error }

    const available = getAvailableFieldJobAction(access.schedule.status)
    if (available !== action) {
      if (action === 'start') {
        return {
          success: false,
          error:
            access.schedule.status === 'in_progress'
              ? 'This job is already in progress'
              : 'Only scheduled jobs can be started',
        }
      }
      return {
        success: false,
        error:
          access.schedule.status === 'archived'
            ? 'This job is already completed'
            : 'Only in-progress jobs can be completed',
      }
    }

    const nextStatus = getFieldJobTargetStatus(action)
    const { error: updateError } = await access.supabaseAdmin
      .from('schedules')
      .update({ status: nextStatus })
      .eq('id', jobId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    try {
      const { queueGoogleCalendarSync } = await import('@/lib/google-calendar-sync')
      await queueGoogleCalendarSync(access.supabaseAdmin, jobId)
    } catch {
      // non-blocking
    }

    revalidatePath('/dashboard/team')
    revalidatePath('/dashboard/crews')
    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath(`/dashboard/clients/${clientId}/jobs/${jobId}`)

    return { success: true, status: nextStatus }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : `Failed to ${action} job`
    console.error(`field job ${action} error:`, error)
    return { success: false, error: message }
  }
}

export async function startFieldJobAction(jobId: string, clientId: string) {
  const result = await applyFieldJobAction(jobId, clientId, 'start')
  if (!result.success) return result
  return {
    success: true as const,
    status: result.status,
    message: getFieldJobSuccessMessage('start'),
  }
}

export async function completeFieldJobAction(jobId: string, clientId: string) {
  const result = await applyFieldJobAction(jobId, clientId, 'complete')
  if (!result.success) return result
  return {
    success: true as const,
    status: result.status,
    message: getFieldJobSuccessMessage('complete'),
  }
}
