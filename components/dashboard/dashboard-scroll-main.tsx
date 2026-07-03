'use client'

import { usePathname } from 'next/navigation'
import { ScrollArea } from '@/components/ui/scroll-area'

const FULL_SCREEN_ROUTE_PREFIXES = [
  '/dashboard/clients',
  '/dashboard/leads',
  '/dashboard/routes',
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
      <main className="flex-1 min-h-0 overflow-hidden">
        {children}
      </main>
    )
  }

  return (
    <main className="flex-1 min-h-0">
      <ScrollArea className="h-full" viewportClassName="scroll-fade">
        {children}
      </ScrollArea>
    </main>
  )
}