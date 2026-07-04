'use client'

import { useNavigation } from '@/components/navigation/navigation-provider'

export function NavigationProgress() {
  const { isNavigating } = useNavigation()

  if (!isNavigating) return null

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/15"
      aria-hidden
    >
      <div className="navigation-progress-bar absolute inset-y-0 w-2/5 bg-primary" />
    </div>
  )
}