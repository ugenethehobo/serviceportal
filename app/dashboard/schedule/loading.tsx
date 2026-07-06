import { RouteLoadingSkeleton } from '@/components/navigation/route-loading'

export default function ScheduleLoading() {
  return (
    <div className="p-6 max-md:p-4">
      <RouteLoadingSkeleton />
    </div>
  )
}