import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6 max-md:gap-3 max-md:p-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
        <Skeleton className="min-h-[240px] rounded-xl" />
        <Skeleton className="min-h-[240px] rounded-xl" />
      </div>
    </div>
  )
}