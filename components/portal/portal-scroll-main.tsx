'use client'

import { ScrollArea } from '@/components/ui/scroll-area'

export function PortalScrollMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 min-h-0">
      <ScrollArea className="h-full" viewportClassName="scroll-fade">
        {children}
      </ScrollArea>
    </main>
  )
}