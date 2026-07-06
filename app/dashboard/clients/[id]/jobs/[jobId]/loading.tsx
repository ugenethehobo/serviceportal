import { RouteLoadingSkeleton } from '@/components/navigation/route-loading'

export default function JobDetailLoading() {
  return (
    <div className="p-6 max-md:p-4">
      <RouteLoadingSkeleton />
    </div>
  )
}