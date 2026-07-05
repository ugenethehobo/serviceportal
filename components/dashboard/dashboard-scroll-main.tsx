'use client'

import { usePathname } from 'next/navigation'
import { NavigationProgress } from '@/components/navigation/navigation-progress'
import { ScrollArea } from '@/components/ui/scroll-area'

const FULL_SCREEN_ROUTE_PREFIXES = [
  '/dashboard/clients',
  '/dashboard/leads',
  '/dashboard/routes',
  '/dashboard/schedule',
  '/dashboard/settings',
  '/dashboard/team',
]

function isFullScreenRoute(pathname: string) {
  return FULL_SCREEN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export function DashboardScrollMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (isFullScreenRoute(pathname)) {
    return (
      <main className="relative flex-1 min-h-0 overflow-hidden">
        <NavigationProgress />
        {children}
      </main>
    )
  }

  return (
    <main className="relative flex-1 min-h-0">
      <NavigationProgress />
      <ScrollArea className="h-full" viewportClassName="scroll-fade">
        {children}
      </ScrollArea>
    </main>
  )
}