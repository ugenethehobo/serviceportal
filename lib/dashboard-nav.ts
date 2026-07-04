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

export type DashboardNavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export const adminNavItems: DashboardNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/leads', label: 'Leads', icon: UserPlus },
  { href: '/dashboard/crews', label: 'Crews', icon: CheckSquare },
  { href: '/dashboard/routes', label: 'Routes', icon: Route },
  { href: '/dashboard/payments', label: 'Payments', icon: Wallet },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export const teamNavItems: DashboardNavItem[] = [
  { href: '/dashboard/team', label: 'My Day', icon: CalendarDays },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function getDashboardNavItems(role?: string) {
  return role === 'team_member' ? teamNavItems : adminNavItems
}

export function isDashboardNavItemActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))
}