import type { LucideIcon } from 'lucide-react'
import { CalendarDays, LayoutGrid, UserRound, Users } from 'lucide-react'
import {
  getCrewTerminology,
  getCrewsNavLabel,
} from '@/lib/crew-terminology'

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

function multiCrewSections(crewLabel?: string | null): CrewsWorkspaceSection[] {
  const { plural, pluralLower, singularLower } = getCrewTerminology(crewLabel)
  return [
    {
      id: 'dispatch',
      label: 'Dispatch',
      description: `Assign today's jobs; leads pull work onto their ${singularLower}.`,
      icon: LayoutGrid,
      group: 'operations',
    },
    {
      id: 'crews',
      label: plural,
      description: `Field ${pluralLower}; leads manage helpers and dispatch.`,
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
}

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
  isSoloBusiness: boolean,
  crewLabel?: string | null
): CrewsWorkspaceSection[] {
  return isSoloBusiness ? SOLO_SECTIONS : multiCrewSections(crewLabel)
}

export function getCrewsWorkspaceDefaultSection(
  isSoloBusiness: boolean
): CrewsSectionId {
  return isSoloBusiness ? 'my-day' : 'dispatch'
}

export function getCrewsWorkspacePageCopy(
  isSoloBusiness: boolean,
  crewLabel?: string | null
): {
  title: string
  description: string
} {
  if (isSoloBusiness) {
    return {
      title: getCrewsNavLabel(true),
      description: 'Your day in the field and tools to schedule yourself.',
    }
  }
  const { pluralLower } = getCrewTerminology(crewLabel)
  return {
    title: getCrewsNavLabel(false, crewLabel),
    description: `Dispatch work, organize ${pluralLower}, and manage team access.`,
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
