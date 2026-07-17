/**
 * Field tech job access + status transitions for My Day (P2).
 * Team members may act on jobs assigned to their crew, or jobs where they are helpers (P4).
 */

import { canTeamMemberAccessJob } from '@/lib/job-helpers'

export type FieldJobAction = 'start' | 'complete'

export type FieldJobStatus = 'scheduled' | 'in_progress' | 'archived' | 'cancelled' | string

/**
 * Team members may only access jobs assigned to their crew (unless marked as helper).
 * Prefer canTeamMemberAccessJob when helper status is known.
 */
export function canTeamMemberAccessCrewJob(
  jobCrewId: string | null | undefined,
  memberCrewId: string | null | undefined,
  isHelper = false
): boolean {
  return canTeamMemberAccessJob({
    jobCrewId,
    memberCrewId,
    isHelper,
  })
}

/**
 * Which field action is available for a raw schedule status.
 * - Start: scheduled → in_progress
 * - Complete: in_progress → archived
 */
export function getAvailableFieldJobAction(
  status: FieldJobStatus
): FieldJobAction | null {
  if (status === 'scheduled') return 'start'
  if (status === 'in_progress') return 'complete'
  return null
}

export function getFieldJobTargetStatus(action: FieldJobAction): 'in_progress' | 'archived' {
  return action === 'start' ? 'in_progress' : 'archived'
}

export function getFieldJobActionLabel(action: FieldJobAction): string {
  return action === 'start' ? 'Start job' : 'Complete job'
}

export function getFieldJobSuccessMessage(action: FieldJobAction): string {
  return action === 'start' ? 'Job started' : 'Job completed'
}
