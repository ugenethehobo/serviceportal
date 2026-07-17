import {
  adminNavItems,
  getDashboardNavItems,
  type DashboardNavItem,
} from '@/lib/dashboard-nav'
import { getCrewsSearchGroupLabel } from '@/lib/crew-terminology'
import type { PlatformPlanId } from '@/lib/platform-billing'
import { getVisibleSettingsNavSections } from '@/lib/settings-nav'
import { matchesSearch } from '@/lib/search'

export type GlobalSearchResultType =
  | 'page'
  | 'settings'
  | 'client'
  | 'job'
  | 'lead'
  | 'crew'
  | 'team'
  | 'estimate'
  | 'document'
  | 'contract'
  | 'contract_template'
  | 'payment'
  | 'photo'
  | 'service_package'

export type GlobalSearchResult = {
  id: string
  type: GlobalSearchResultType
  title: string
  subtitle?: string
  href: string
  group: string
}

/** Default order; crews group label is company-customizable via getGlobalSearchGroupOrder. */
export const GLOBAL_SEARCH_GROUP_ORDER = [
  'Pages',
  'Settings',
  'Clients',
  'Jobs',
  'Leads',
  'Estimates',
  'Documents',
  'Contracts',
  'Photos',
  'Payments',
  'Crews',
  'Service packages',
] as const

export function getGlobalSearchGroupOrder(
  isSoloBusiness = false,
  crewLabel?: string | null
): string[] {
  const crewsGroup = getCrewsSearchGroupLabel(isSoloBusiness, crewLabel)
  return GLOBAL_SEARCH_GROUP_ORDER.map((group) =>
    group === 'Crews' ? crewsGroup : group
  )
}

const EXTRA_PAGE_SHORTCUTS: Array<DashboardNavItem & { keywords?: string[] }> = [
  {
    href: '/dashboard/reports',
    label: 'Business reports',
    icon: adminNavItems.find((item) => item.href === '/dashboard/reports')!.icon,
    keywords: ['revenue', 'analytics', 'kpi', 'performance', 'charts'],
  },
]

export function escapeIlikePattern(value: string): string {
  return value.trim().replace(/[%_\\,]/g, (char) => `\\${char}`)
}

export function toIlikePattern(query: string): string {
  const escaped = escapeIlikePattern(query)
  if (!escaped) return '%'
  return `%${escaped}%`
}

export function getGlobalSearchResultKey(result: GlobalSearchResult): string {
  if (result.type === 'page' || result.type === 'settings') {
    return `${result.type}:${result.href}`
  }
  return `${result.type}:${result.id}`
}

export function dedupeGlobalSearchResults(results: GlobalSearchResult[]): GlobalSearchResult[] {
  const seen = new Set<string>()
  const deduped: GlobalSearchResult[] = []

  for (const result of results) {
    const key = getGlobalSearchResultKey(result)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(result)
  }

  return deduped
}

export function groupGlobalSearchResults(
  results: GlobalSearchResult[],
  groupOrder: readonly string[] = GLOBAL_SEARCH_GROUP_ORDER
): GlobalSearchResult[] {
  const order = new Map(groupOrder.map((group, index) => [group, index]))
  return dedupeGlobalSearchResults(results).sort((a, b) => {
    const groupDelta = (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99)
    if (groupDelta !== 0) return groupDelta
    return a.title.localeCompare(b.title)
  })
}

export function searchStaticGlobalResults(
  query: string,
  options: {
    role?: string
    plan?: PlatformPlanId | null
    isSoloBusiness?: boolean
    crewLabel?: string | null
  }
): GlobalSearchResult[] {
  const normalized = query.trim()
  if (!normalized) return []

  const results: GlobalSearchResult[] = []
  const matchedPageHrefs = new Set<string>()
  const isAdmin = options.role === 'company_admin'

  const navItems = getDashboardNavItems(options.role, options.plan, options.isSoloBusiness, {
    crewLabel: options.crewLabel,
  })
  for (const item of navItems) {
    if (item.locked) continue
    if (
      matchesSearch(normalized, item.label, item.href.replace('/dashboard/', '').replace(/-/g, ' '))
    ) {
      matchedPageHrefs.add(item.href)
      results.push({
        id: item.href,
        type: 'page',
        title: item.label,
        subtitle: 'Go to page',
        href: item.href,
        group: 'Pages',
      })
    }
  }

  if (isAdmin) {
    for (const item of EXTRA_PAGE_SHORTCUTS) {
      if (matchedPageHrefs.has(item.href)) continue
      if (matchesSearch(normalized, item.label, ...(item.keywords ?? []))) {
        matchedPageHrefs.add(item.href)
        results.push({
          id: item.href,
          type: 'page',
          title: item.label,
          subtitle: 'Go to page',
          href: item.href,
          group: 'Pages',
        })
      }
    }
  }

  for (const section of getVisibleSettingsNavSections(options.role)) {
    if (
      matchesSearch(
        normalized,
        section.label,
        section.description,
        section.id.replace(/-/g, ' '),
        ...(section.keywords ?? [])
      )
    ) {
      results.push({
        id: `settings:${section.id}`,
        type: 'settings',
        title: section.label,
        subtitle: section.description,
        href: `/dashboard/settings?section=${section.id}`,
        group: 'Settings',
      })
    }
  }

  return results
}

export function mergeGlobalSearchResults(
  staticResults: GlobalSearchResult[],
  remoteResults: GlobalSearchResult[],
  groupOrder?: readonly string[]
): GlobalSearchResult[] {
  return groupGlobalSearchResults(
    [...staticResults, ...remoteResults],
    groupOrder
  )
}