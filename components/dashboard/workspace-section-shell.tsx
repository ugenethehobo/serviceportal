'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { MainPageCard } from '@/components/ui/main-page-card'
import { PageHeader } from '@/components/ui/page-header'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MOBILE_NATURAL_HEIGHT_CLASS,
  MOBILE_PAGE_ROOT_CLASS,
  MOBILE_SELECT_TRIGGER_CLASS,
} from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'

export type WorkspaceNavSection = {
  id: string
  label: string
  description: string
  icon: LucideIcon
  groupId?: string
}

export type WorkspaceNavGroup = {
  id: string
  label: string
}

type WorkspaceSectionShellProps = {
  title: string
  description?: string
  sections: WorkspaceNavSection[]
  groups?: WorkspaceNavGroup[]
  /** Query param name for deep links (default: section). */
  paramKey?: string
  defaultSectionId: string
  children: (activeSectionId: string) => ReactNode
  /** Optional actions for the active section (right side of content header area). */
  sectionActions?: (activeSectionId: string) => ReactNode
}

function SectionNavButton({
  section,
  isActive,
  onClick,
}: {
  section: WorkspaceNavSection
  isActive: boolean
  onClick: () => void
}) {
  const Icon = section.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg px-3 py-2.5 text-left transition-colors max-md:min-h-11 max-md:py-3',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <span className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{section.label}</span>
          <span className="mt-0.5 block text-xs opacity-80">{section.description}</span>
        </span>
      </span>
    </button>
  )
}

/**
 * Settings-style workspace shell: left section rail on desktop, select on mobile.
 * Keeps many related tools on one page without a growing horizontal tab strip.
 */
export function WorkspaceSectionShell({
  title,
  description,
  sections,
  groups,
  paramKey = 'section',
  defaultSectionId,
  children,
  sectionActions,
}: WorkspaceSectionShellProps) {
  const searchParams = useSearchParams()
  const requested = searchParams.get(paramKey)

  const resolvedDefault = useMemo(() => {
    if (requested && sections.some((s) => s.id === requested)) return requested
    if (sections.some((s) => s.id === defaultSectionId)) return defaultSectionId
    return sections[0]?.id ?? defaultSectionId
  }, [defaultSectionId, requested, sections])

  const [activeSectionId, setActiveSectionId] = useState(resolvedDefault)

  useEffect(() => {
    setActiveSectionId(resolvedDefault)
  }, [resolvedDefault])

  const syncSectionInUrl = useCallback(
    (sectionId: string) => {
      const params = new URLSearchParams(window.location.search)
      params.set(paramKey, sectionId)
      const next = `${window.location.pathname}?${params.toString()}`
      window.history.replaceState(window.history.state, '', next)
    },
    [paramKey]
  )

  const setActiveSection = useCallback(
    (sectionId: string) => {
      if (sectionId === activeSectionId) return
      setActiveSectionId(sectionId)
      syncSectionInUrl(sectionId)
    },
    [activeSectionId, syncSectionInUrl]
  )

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const section = params.get(paramKey)
      if (section && sections.some((s) => s.id === section)) {
        setActiveSectionId(section)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [paramKey, sections])

  const activeMeta = sections.find((s) => s.id === activeSectionId)

  const grouped = useMemo(() => {
    if (!groups?.length) {
      return [{ group: null as WorkspaceNavGroup | null, sections }]
    }
    return groups
      .map((group) => ({
        group,
        sections: sections.filter((s) => s.groupId === group.id),
      }))
      .filter((entry) => entry.sections.length > 0)
  }, [groups, sections])

  return (
    <div className={MOBILE_PAGE_ROOT_CLASS}>
      <PageHeader title={title} description={description} size="compact" />

      <MainPageCard className="min-h-0 flex-1 overflow-hidden p-0">
        <div
          className={`flex min-h-0 flex-1 flex-col lg:flex-row ${MOBILE_NATURAL_HEIGHT_CLASS}`}
        >
          <div className="shrink-0 border-b p-3 lg:hidden">
            <Select
              value={activeSectionId}
              onValueChange={(value) => {
                if (value) setActiveSection(value)
              }}
            >
              <SelectTrigger className={cn(MOBILE_SELECT_TRIGGER_CLASS, 'min-h-11')}>
                <SelectValue placeholder="Choose a section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeMeta ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {activeMeta.description}
              </p>
            ) : null}
          </div>

          <aside className="hidden shrink-0 border-b lg:flex lg:w-64 lg:min-h-0 lg:flex-col lg:overflow-hidden lg:border-b-0 lg:border-r xl:w-72">
            <ScrollArea className="w-full lg:min-h-0 lg:flex-1" viewportClassName="scroll-fade">
              <nav className="flex flex-col gap-4 p-3" aria-label={`${title} sections`}>
                {grouped.map(({ group, sections: groupSections }) => (
                  <div key={group?.id ?? 'all'} className="flex flex-col gap-1">
                    {group ? (
                      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                        {group.label}
                      </p>
                    ) : null}
                    {groupSections.map((section) => (
                      <SectionNavButton
                        key={section.id}
                        section={section}
                        isActive={activeSectionId === section.id}
                        onClick={() => setActiveSection(section.id)}
                      />
                    ))}
                  </div>
                ))}
              </nav>
            </ScrollArea>
          </aside>

          <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${MOBILE_NATURAL_HEIGHT_CLASS}`}>
            {(activeMeta || sectionActions) && (
              <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  {activeMeta ? (
                    <>
                      <h2 className="text-base font-semibold tracking-tight text-foreground">
                        {activeMeta.label}
                      </h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {activeMeta.description}
                      </p>
                    </>
                  ) : null}
                </div>
                {sectionActions ? (
                  <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center max-md:[&_button]:min-h-11 max-md:[&_button]:w-full">
                    {sectionActions(activeSectionId)}
                  </div>
                ) : null}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-hidden max-md:overflow-visible">
              {children(activeSectionId)}
            </div>
          </div>
        </div>
      </MainPageCard>
    </div>
  )
}
