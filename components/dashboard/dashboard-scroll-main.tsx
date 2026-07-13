'use client'

import { usePathname } from 'next/navigation'
import { NavigationProgress } from '@/components/navigation/navigation-progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const FULL_SCREEN_ROUTE_PREFIXES = ['/dashboard']

function isFullScreenRoute(pathname: string) {
  return FULL_SCREEN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

function isRoutePlannerRoute(pathname: string) {
  return pathname === '/dashboard/routes' || pathname.startsWith('/dashboard/routes/')
}

export function DashboardScrollMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const routePlannerMobile = isRoutePlannerRoute(pathname)

  if (isFullScreenRoute(pathname)) {
    return (
      <main
        className={cn(
          'relative min-h-0 flex-1 min-w-0 overflow-hidden max-md:overflow-x-hidden max-md:overscroll-y-contain',
          routePlannerMobile
            ? 'max-md:flex max-md:flex-col max-md:overflow-hidden'
            : 'max-md:overflow-y-auto'
        )}
      >
        <NavigationProgress />
        {children}
      </main>
    )
  }

  return (
    <main className="relative min-h-0 min-w-0 flex-1 max-md:overflow-x-hidden">
      <NavigationProgress />
      <ScrollArea
        className="h-full max-md:min-w-0"
        viewportClassName="scroll-fade max-md:overflow-x-hidden"
      >
        {children}
      </ScrollArea>
    </main>
  )
}