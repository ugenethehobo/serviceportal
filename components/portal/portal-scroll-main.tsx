'use client'

import { NavigationProgress } from '@/components/navigation/navigation-progress'
import { ScrollArea } from '@/components/ui/scroll-area'

export function PortalScrollMain({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <main className={`relative min-h-0 ${className || 'flex-1'}`}>
      <NavigationProgress />
      <ScrollArea className="h-full scroll-fade" viewportClassName="scroll-fade">
        {children}
      </ScrollArea>
    </main>
  )
}