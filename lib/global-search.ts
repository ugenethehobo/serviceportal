import {
  adminNavItems,
  getDashboardNavItems,
  type DashboardNavItem,
} from '@/lib/dashboard-nav'
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
  'Crews & team',
  'Service packages',
] as const

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

export function groupGlobalSearchResults(results: GlobalSearchResult[]): GlobalSearchResult[] {
  const order = new Map(GLOBAL_SEARCH_GROUP_ORDER.map((group, index) => [group, index]))
  return dedupeGlobalSearchResults(results).sort((a, b) => {
    const groupDelta =
      (order.get(a.group as (typeof GLOBAL_SEARCH_GROUP_ORDER)[number]) ?? 99) -
      (order.get(b.group as (typeof GLOBAL_SEARCH_GROUP_ORDER)[number]) ?? 99)
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
  }
): GlobalSearchResult[] {
  const normalized = query.trim()
  if (!normalized) return []

  const results: GlobalSearchResult[] = []
  const matchedPageHrefs = new Set<string>()
  const isAdmin = options.role === 'company_admin'

  const navItems = getDashboardNavItems(options.role, options.plan, options.isSoloBusiness)
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
  remoteResults: GlobalSearchResult[]
): GlobalSearchResult[] {
  return groupGlobalSearchResults([...staticResults, ...remoteResults])
}