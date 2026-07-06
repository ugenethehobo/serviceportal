import { getReportsDataAction } from '@/app/action'
import { ReportsPageClient } from '@/components/dashboard/reports-page-client'

export default async function ReportsPage() {
  const result = await getReportsDataAction('30d')

  if (!result.success) {
    return (
      <div className="p-6 flex flex-col h-full min-h-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        </div>
        <div className="flex-1 flex items-center justify-center rounded-xl border bg-card">
          <p className="text-sm text-muted-foreground">
            {result.error || 'Unable to load reports.'}
          </p>
        </div>
      </div>
    )
  }

  return <ReportsPageClient initialData={result.data} />
}