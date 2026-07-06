import { getCrewsPageDataAction } from '@/app/action'
import { CrewsPageClient } from '@/components/dashboard/crews-page-client'

export default async function CrewsPage() {
  const result = await getCrewsPageDataAction()

  if (!result.success) {
    return (
      <div className="p-6 flex flex-col h-full min-h-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Crews</h1>
        </div>
        <div className="flex-1 flex items-center justify-center rounded-xl border bg-card">
          <p className="text-sm text-muted-foreground">
            {result.error || 'Unable to load crews.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <CrewsPageClient
      initialCrews={result.data.crews}
      initialAvailableMembers={result.data.availableMembers}
      initialIsSoloBusiness={result.data.isSoloBusiness}
      initialEntitlements={result.data.entitlements}
    />
  )
}