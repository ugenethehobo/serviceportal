/**
 * Field tech job access + status transitions for My Day (P2).
 * Team members may only act on jobs assigned to their crew.
 */

export type FieldJobAction = 'start' | 'complete'

export type FieldJobStatus = 'scheduled' | 'in_progress' | 'archived' | 'cancelled' | string

/** Team members may only access jobs assigned to their crew. Admins use company-wide access. */
export function canTeamMemberAccessCrewJob(
  jobCrewId: string | null | undefined,
  memberCrewId: string | null | undefined
): boolean {
  if (!memberCrewId) return false
  if (!jobCrewId) return false
  return jobCrewId === memberCrewId
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
