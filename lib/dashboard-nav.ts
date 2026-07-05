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

export function getCrewsNavItem(isSoloBusiness = false): DashboardNavItem {
  return {
    href: '/dashboard/crews',
    label: isSoloBusiness ? 'Team' : 'Crews & Team',
    icon: CheckSquare,
  }
}

export const adminNavItems: DashboardNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/leads', label: 'Leads', icon: UserPlus },
  getCrewsNavItem(false),
  { href: '/dashboard/routes', label: 'Routes', icon: Route },
  { href: '/dashboard/payments', label: 'Payments', icon: Wallet },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export const teamNavItems: DashboardNavItem[] = [
  { href: '/dashboard/team', label: 'My Day', icon: CalendarDays },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

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
  isSoloBusiness = false
): DashboardNavItemWithAccess[] {
  const items =
    role === 'team_member'
      ? teamNavItems
      : adminNavItems.map((item) =>
          item.href === '/dashboard/crews' ? getCrewsNavItem(isSoloBusiness) : item
        )
  return applyPlanAccessToNavItems(items, plan)
}

export function getDashboardNavItemsForEntitlements(
  role: string | undefined,
  entitlements: PlanEntitlements | null
) {
  return getDashboardNavItems(role, entitlements?.plan)
}

export function isDashboardNavItemActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))
}