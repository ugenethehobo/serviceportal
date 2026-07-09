'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const LandingScrollRootContext = createContext<HTMLElement | null>(null)

export function useLandingScrollRoot() {
  return useContext(LandingScrollRootContext)
}

export function LandingScrollRoot({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null)

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      setScrollRoot(null)
      return
    }
    const viewport = node.querySelector(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLElement | null
    setScrollRoot(viewport)
  }, [])

  return (
    <LandingScrollRootContext.Provider value={scrollRoot}>
      <div ref={containerRef} className={cn('relative z-20 h-dvh min-h-0', className)}>
        <ScrollArea
          className={cn(
            'h-full w-full',
            '[&_[data-slot=scroll-area-scrollbar]]:z-[70]',
            '[&_[data-slot=scroll-area-scrollbar]]:pointer-events-auto'
          )}
          viewportClassName="scroll-fade size-full"
        >
          {children}
        </ScrollArea>
      </div>
    </LandingScrollRootContext.Provider>
  )
}