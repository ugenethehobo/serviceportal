import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type PageLoadingSkeletonProps = {
  variant?: 'default' | 'cards' | 'table'
  className?: string
}

export function PageLoadingSkeleton({
  variant = 'default',
  className,
}: PageLoadingSkeletonProps) {
  if (variant === 'cards') {
    return (
      <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div className={cn('space-y-3', className)}>
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('space-y-6 animate-in fade-in duration-200', className)}>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  )
}