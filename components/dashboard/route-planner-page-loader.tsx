'use client'

import dynamic from 'next/dynamic'
import { RouteLoadingSkeleton } from '@/components/navigation/route-loading'
import type { RoutePlannerData } from '@/lib/route-planner'

const RoutePlannerPageClient = dynamic(
  () =>
    import('@/components/dashboard/route-planner-page-client').then((m) => ({
      default: m.RoutePlannerPageClient,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="p-6">
        <RouteLoadingSkeleton />
      </div>
    ),
  }
)

export function RoutePlannerPageLoader({ initialData }: { initialData: RoutePlannerData }) {
  return <RoutePlannerPageClient initialData={initialData} />
}