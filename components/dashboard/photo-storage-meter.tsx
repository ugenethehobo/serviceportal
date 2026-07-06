'use client'

import { getPhotoStorageUsagePercent } from '@/lib/job-photo-storage'
import { cn } from '@/lib/utils'

export function PhotoStorageMeter({
  usedLabel,
  limitLabel,
  usedBytes,
  limitBytes,
  className,
}: {
  usedLabel: string
  limitLabel: string
  usedBytes: number
  limitBytes: number
  className?: string
}) {
  const percent = getPhotoStorageUsagePercent(usedBytes, limitBytes)
  const isNearFull = percent >= 85

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">Photo storage</span>
        <span className={cn('font-medium', isNearFull && 'text-orange-600')}>
          {usedLabel} / {limitLabel}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isNearFull ? 'bg-orange-500' : 'bg-primary'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}