import { getLeadsAction } from '@/app/action'
import { LeadsPageClient } from '@/components/dashboard/leads-page-client'

export default async function LeadsPage() {
  const result = await getLeadsAction()

  if (!result.success) {
    return (
      <div className="p-6 flex flex-col h-full min-h-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
        </div>
        <div className="flex-1 flex items-center justify-center rounded-xl border bg-card">
          <p className="text-sm text-muted-foreground">
            {result.error || 'Unable to load leads.'}
          </p>
        </div>
      </div>
    )
  }

  return <LeadsPageClient initialLeads={result.data} />
}