import { getRoutePlannerDataAction } from '@/app/action'
import { RoutePlannerPageClient } from '@/components/dashboard/route-planner-page-client'

export const dynamic = 'force-dynamic'

export default async function RoutePlannerPage() {
  const result = await getRoutePlannerDataAction()

  if (!result.success) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {result.error || 'Unable to load route planner.'}
        </p>
      </div>
    )
  }

  return <RoutePlannerPageClient initialData={result.data} />
}