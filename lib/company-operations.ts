export const SOLO_CREW_NAME = 'Owner'

export const CREW_ASSIGNABLE_ROLES = ['company_admin', 'team_member'] as const

export type CrewAssignableRole = (typeof CREW_ASSIGNABLE_ROLES)[number]

export function isSoloBusiness(company: { is_solo_business?: boolean | null } | null | undefined) {
  return Boolean(company?.is_solo_business)
}

export function getCrewsNavLabel(isSoloBusinessMode: boolean) {
  return isSoloBusinessMode ? 'Team' : 'Crews & Team'
}

export function getActiveCrewsHeading(isSoloBusinessMode: boolean) {
  return isSoloBusinessMode ? "Today's Schedule" : 'Active Crews Today'
}