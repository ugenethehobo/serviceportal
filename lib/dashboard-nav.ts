import {
  LayoutDashboard,
  Users,
  UserPlus,
  CheckSquare,
  BarChart3,
  Route,
  Settings,
  CalendarDays,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { getCrewsNavLabel } from '@/lib/crew-terminology'
import {
  canAccessPlatformFeature,
  getPlatformFeatureUpgradeMessage,
  getPlanEntitlements,
  type PlanEntitlements,
  type PlatformFeature,
} from '@/lib/platform-entitlements'
import type { PlatformPlanId } from '@/lib/platform-billing'

export type DashboardNavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export type DashboardNavItemWithAccess = DashboardNavItem & {
  locked?: boolean
  upgradeMessage?: string
}

const NAV_ITEM_FEATURES: Partial<Record<string, PlatformFeature>> = {
  '/dashboard/routes': 'routes',
  '/dashboard/reports': 'reports',
}

export function getCrewsNavItem(
  isSoloBusiness = false,
  crewLabel?: string | null
): DashboardNavItem {
  return {
    href: '/dashboard/crews',
    label: getCrewsNavLabel(isSoloBusiness, crewLabel),
    icon: CheckSquare,
  }
}

export const adminNavItems: DashboardNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/leads', label: 'Leads', icon: UserPlus },
  getCrewsNavItem(false, null),
  { href: '/dashboard/routes', label: 'Routes', icon: Route },
  { href: '/dashboard/payments', label: 'Payments', icon: Wallet },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export const teamNavItems: DashboardNavItem[] = [
  { href: '/dashboard/team', label: 'My Day', icon: CalendarDays },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

/** Crew leads get a Dispatch entry (P4) pointing at the crews workspace. */
export const teamLeadDispatchNavItem: DashboardNavItem = {
  href: '/dashboard/crews?section=dispatch',
  label: 'Dispatch',
  icon: CheckSquare,
}

function applyPlanAccessToNavItems(
  items: DashboardNavItem[],
  plan?: PlatformPlanId | null
): DashboardNavItemWithAccess[] {
  return items.map((item) => {
    const feature = NAV_ITEM_FEATURES[item.href]
    if (!feature || !plan || canAccessPlatformFeature(plan, feature)) {
      return item
    }

    return {
      ...item,
      locked: true,
      upgradeMessage: getPlatformFeatureUpgradeMessage(feature),
    }
  })
}

export function getDashboardNavItems(
  role?: string,
  plan?: PlatformPlanId | null,
  isSoloBusiness = false,
  options?: { isCrewLead?: boolean; crewLabel?: string | null }
): DashboardNavItemWithAccess[] {
  let items: DashboardNavItem[]
  if (role === 'team_member') {
    items = [...teamNavItems]
    if (options?.isCrewLead) {
      // Insert Dispatch after My Day
      items = [
        teamNavItems[0],
        teamLeadDispatchNavItem,
        ...teamNavItems.slice(1),
      ]
    }
  } else {
    items = adminNavItems.map((item) =>
      item.href === '/dashboard/crews'
        ? getCrewsNavItem(isSoloBusiness, options?.crewLabel)
        : item
    )
  }
  return applyPlanAccessToNavItems(items, plan)
}

export function getDashboardNavItemsForEntitlements(
  role: string | undefined,
  entitlements: PlanEntitlements | null,
  options?: {
    isCrewLead?: boolean
    isSoloBusiness?: boolean
    crewLabel?: string | null
  }
) {
  return getDashboardNavItems(
    role,
    entitlements?.plan,
    options?.isSoloBusiness ?? false,
    {
      isCrewLead: options?.isCrewLead,
      crewLabel: options?.crewLabel,
    }
  )
}

export function isDashboardNavItemActive(pathname: string, href: string) {
  // Nav hrefs may include query (e.g. crew-lead Dispatch → ?section=dispatch)
  const hrefPath = href.split('?')[0] || href
  return (
    pathname === hrefPath ||
    (hrefPath !== '/dashboard' && pathname.startsWith(`${hrefPath}/`))
  )
}
