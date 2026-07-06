import { getRoutePlannerDataAction } from '@/app/action'
import { RoutePlannerPageLoader } from '@/components/dashboard/route-planner-page-loader'

export const dynamic = 'force-dynamic'

export default async function RoutePlannerPage() {
  const result = await getRoutePlannerDataAction()

  if (!result.success) {
    return (
      <div className="p-6 flex flex-col h-full min-h-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Route Planner</h1>
        </div>
        <div className="flex-1 flex items-center justify-center rounded-xl border bg-card">
          <p className="text-sm text-muted-foreground">
            {result.error || 'Unable to load route planner.'}
          </p>
        </div>
      </div>
    )
  }

  return <RoutePlannerPageLoader initialData={result.data} />
}