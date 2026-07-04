import { RouteLoadingSkeleton } from '@/components/navigation/route-loading'

export default function DashboardLoading() {
  return (
    <div className="p-6">
      <RouteLoadingSkeleton />
    </div>
  )
}