'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Calendar as CalendarIcon,
  Settings,
  Map
} from 'lucide-react'
import { SubscriptionStatusPill } from './SubscriptionStatusPill'

export default function SidebarNav() {
  const pathname = usePathname()

  const navItems = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard
    },
    {
      href: '/dashboard/leads',
      label: 'Leads',
      icon: UserPlus
    },
    {
      href: '/dashboard/clients',
      label: 'Clients',
      icon: Users
    },
    {
      href: '/dashboard/calendar',
      label: 'Calendar',
      icon: CalendarIcon
    },
    {
      href: '/dashboard/route-planner',
      label: 'Route Planner',
      icon: Map
    },
    {
      href: '/dashboard/settings',
      label: 'Settings',
      icon: Settings
    },
  ]

  return (
    <nav className="flex-1 p-4">
      <div className="mb-3 px-1">
        <SubscriptionStatusPill />
      </div>
      <div className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href ||
            (item.href === '/dashboard/clients' && pathname.startsWith('/dashboard/clients')) ||
            (item.href === '/dashboard/leads' && pathname.startsWith('/dashboard/leads'))

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
