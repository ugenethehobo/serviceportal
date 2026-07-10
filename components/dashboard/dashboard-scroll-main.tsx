'use client'

import { usePathname } from 'next/navigation'
import { NavigationProgress } from '@/components/navigation/navigation-progress'
import { ScrollArea } from '@/components/ui/scroll-area'

const FULL_SCREEN_ROUTE_PREFIXES = ['/dashboard']

function isFullScreenRoute(pathname: string) {
  return FULL_SCREEN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export function DashboardScrollMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (isFullScreenRoute(pathname)) {
    return (
      <main className="relative min-h-0 flex-1 min-w-0 overflow-hidden max-md:overflow-x-hidden max-md:overflow-y-auto max-md:overscroll-y-contain">
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