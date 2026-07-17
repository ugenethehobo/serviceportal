/**
 * Multi-tech job helpers + crew lead operational rules (P4).
 * Primary assignment remains schedules.crew_id; helpers are extra techs.
 */

export const MAX_JOB_HELPERS = 6

export type JobHelperPerson = {
  id: string
  fullName: string
  avatarUrl?: string | null
  crewId?: string | null
}

export type CrewLeadContext = {
  role: string
  userId: string
  /** Crew the user belongs to (profiles.crew_id) */
  memberCrewId: string | null
  /** Crew ids where this user is crew_lead_id */
  leadCrewIds: string[]
  isSoloBusiness: boolean
}

/** True when the profile is the designated lead for a crew. */
export function isCrewLead(
  userId: string | null | undefined,
  crewLeadId: string | null | undefined
): boolean {
  if (!userId || !crewLeadId) return false
  return userId === crewLeadId
}

export function userLeadsCrew(
  leadCrewIds: string[] | null | undefined,
  crewId: string | null | undefined
): boolean {
  if (!crewId || !leadCrewIds?.length) return false
  return leadCrewIds.includes(crewId)
}

/**
 * Team members may open/act on a job when they are on the assigned crew
 * or listed as a helper on that job.
 */
export function canTeamMemberAccessJob(input: {
  jobCrewId: string | null | undefined
  memberCrewId: string | null | undefined
  isHelper: boolean
}): boolean {
  if (input.isHelper) return true
  if (!input.memberCrewId || !input.jobCrewId) return false
  return input.jobCrewId === input.memberCrewId
}

/**
 * Who may edit the helper list on a job.
 * - Solo: never (single owner)
 * - Company admin: always
 * - Crew lead of the job's assigned crew: yes
 * - Helpers / plain members: no
 */
export function canManageJobHelpers(input: {
  role: string
  isSoloBusiness: boolean
  jobCrewId: string | null | undefined
  leadCrewIds: string[]
}): boolean {
  if (input.isSoloBusiness) return false
  if (input.role === 'company_admin') return true
  if (input.role !== 'team_member') return false
  return userLeadsCrew(input.leadCrewIds, input.jobCrewId ?? null)
}

/**
 * Crew lead dispatch reassignment rules (admin always allowed separately).
 * Lead may only move jobs between Unassigned and their own crew column.
 */
export function canCrewLeadReassignDispatch(input: {
  leadCrewId: string
  sourceCrewId: string | null
  targetCrewId: string | null
}): boolean {
  const { leadCrewId, sourceCrewId, targetCrewId } = input
  if (!leadCrewId) return false

  const sourceOk = sourceCrewId === null || sourceCrewId === leadCrewId
  const targetOk = targetCrewId === null || targetCrewId === leadCrewId
  if (!sourceOk || !targetOk) return false

  // Must involve their crew or unassigned (not other crews)
  return sourceCrewId === leadCrewId || targetCrewId === leadCrewId || sourceCrewId === null
}

/** Normalize helper profile ids: unique, capped, non-empty strings. */
export function normalizeHelperProfileIds(
  profileIds: string[],
  max = MAX_JOB_HELPERS
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of profileIds) {
    const id = typeof raw === 'string' ? raw.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= max) break
  }
  return out
}

/**
 * Candidates for the helper picker: company staff, excluding optional ids.
 * Solo mode returns empty (helpers not used).
 */
export function filterHelperCandidates(
  people: Array<{
    id: string
    full_name?: string | null
    fullName?: string | null
    avatar_url?: string | null
    avatarUrl?: string | null
    crew_id?: string | null
    crewId?: string | null
    role?: string | null
  }>,
  options?: {
    isSoloBusiness?: boolean
    excludeProfileIds?: string[]
    assignableRoles?: string[]
  }
): JobHelperPerson[] {
  if (options?.isSoloBusiness) return []

  const exclude = new Set(options?.excludeProfileIds ?? [])
  const roles = new Set(
    options?.assignableRoles ?? ['company_admin', 'team_member']
  )

  return people
    .filter((p) => {
      if (!p.id || exclude.has(p.id)) return false
      if (p.role && !roles.has(p.role)) return false
      return true
    })
    .map((p) => ({
      id: p.id,
      fullName: (p.fullName || p.full_name || 'Team member').trim() || 'Team member',
      avatarUrl: p.avatarUrl ?? p.avatar_url ?? null,
      crewId: p.crewId ?? p.crew_id ?? null,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/** Crew lead must be one of the selected members (or null). */
export function resolveValidCrewLeadId(
  memberIds: string[],
  requestedLeadId: string | null | undefined
): string | null {
  if (!requestedLeadId) return null
  return memberIds.includes(requestedLeadId) ? requestedLeadId : null
}

export function formatHelperSummary(
  helpers: Array<{ fullName: string }>,
  maxNames = 2
): string | null {
  if (helpers.length === 0) return null
  if (helpers.length <= maxNames) {
    return helpers.map((h) => h.fullName.split(' ')[0] || h.fullName).join(', ')
  }
  const shown = helpers
    .slice(0, maxNames)
    .map((h) => h.fullName.split(' ')[0] || h.fullName)
    .join(', ')
  return `${shown} +${helpers.length - maxNames}`
}
