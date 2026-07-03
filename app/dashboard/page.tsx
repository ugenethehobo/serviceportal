import { getDashboardOverviewAction } from '@/app/action'
import { DashboardPageClient } from '@/components/dashboard/dashboard-page-client'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const result = await getDashboardOverviewAction()

  if (!result.success) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {result.error || 'Unable to load dashboard.'}
        </p>
      </div>
    )
  }

  return <DashboardPageClient initialData={result.data} />
}