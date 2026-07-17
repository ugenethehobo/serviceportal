import type { LucideIcon } from 'lucide-react'
import { CalendarDays, LayoutGrid, UserRound, Users } from 'lucide-react'
import { getCrewsNavLabel } from '@/lib/company-operations'

/** Multi-crew workspace sections */
export type MultiCrewSectionId = 'dispatch' | 'crews' | 'team'

/** Solo business workspace sections */
export type SoloCrewSectionId = 'my-day' | 'schedule'

export type CrewsSectionId = MultiCrewSectionId | SoloCrewSectionId

export type CrewsSectionGroupId = 'operations' | 'people'

export type CrewsWorkspaceSection = {
  id: CrewsSectionId
  label: string
  description: string
  icon: LucideIcon
  group: CrewsSectionGroupId
}

export type CrewsSectionGroup = {
  id: CrewsSectionGroupId
  label: string
}

export const CREWS_SECTION_GROUPS: CrewsSectionGroup[] = [
  { id: 'operations', label: 'Operations' },
  { id: 'people', label: 'People' },
]

const MULTI_CREW_SECTIONS: CrewsWorkspaceSection[] = [
  {
    id: 'dispatch',
    label: 'Dispatch',
    description: "Assign today's jobs to crews.",
    icon: LayoutGrid,
    group: 'operations',
  },
  {
    id: 'crews',
    label: 'Crews',
    description: 'Field teams and crew leads.',
    icon: Users,
    group: 'people',
  },
  {
    id: 'team',
    label: 'Team members',
    description: 'Accounts, roles, and invites.',
    icon: UserRound,
    group: 'people',
  },
]

const SOLO_SECTIONS: CrewsWorkspaceSection[] = [
  {
    id: 'my-day',
    label: 'My Day',
    description: "Today's jobs, map, and route.",
    icon: CalendarDays,
    group: 'operations',
  },
  {
    id: 'schedule',
    label: 'My Schedule',
    description: 'Put unassigned jobs on your day.',
    icon: LayoutGrid,
    group: 'operations',
  },
]

export function getCrewsWorkspaceSections(
  isSoloBusiness: boolean
): CrewsWorkspaceSection[] {
  return isSoloBusiness ? SOLO_SECTIONS : MULTI_CREW_SECTIONS
}

export function getCrewsWorkspaceDefaultSection(
  isSoloBusiness: boolean
): CrewsSectionId {
  return isSoloBusiness ? 'my-day' : 'dispatch'
}

export function getCrewsWorkspacePageCopy(isSoloBusiness: boolean): {
  title: string
  description: string
} {
  if (isSoloBusiness) {
    return {
      title: getCrewsNavLabel(true),
      description: 'Your day in the field and tools to schedule yourself.',
    }
  }
  return {
    title: getCrewsNavLabel(false),
    description: 'Dispatch work, organize crews, and manage team access.',
  }
}

export function resolveCrewsWorkspaceSection(
  requested: string | null | undefined,
  sections: CrewsWorkspaceSection[],
  fallback: CrewsSectionId
): CrewsSectionId {
  if (requested && sections.some((section) => section.id === requested)) {
    return requested as CrewsSectionId
  }
  return sections[0]?.id ?? fallback
}

export function groupCrewsWorkspaceSections(
  sections: CrewsWorkspaceSection[]
): { group: CrewsSectionGroup; sections: CrewsWorkspaceSection[] }[] {
  return CREWS_SECTION_GROUPS.map((group) => ({
    group,
    sections: sections.filter((section) => section.group === group.id),
  })).filter((entry) => entry.sections.length > 0)
}
