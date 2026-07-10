'use client'

import { PageLoadingSkeleton } from '@/components/ui/page-loading-skeleton'
import { cn } from '@/lib/utils'

export function SettingsSectionLoadingOverlay({
  className,
}: {
  className?: string
}) {
  return (
    <div
      className={cn(
        'absolute inset-0 z-10 flex items-start justify-center bg-background/70 p-6 backdrop-blur-[1px]',
        className
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-2xl">
        <PageLoadingSkeleton />
      </div>
    </div>
  )
}