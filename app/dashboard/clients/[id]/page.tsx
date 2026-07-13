import { getClientDetailAction } from '@/app/action'
import { ClientDetailPageClient } from '@/components/dashboard/client-detail-page-client'

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getClientDetailAction(id)

  if (!result.success) {
    return (
      <div className="p-6 flex flex-col h-full min-h-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Client</h1>
        </div>
        <div className="flex-1 flex items-center justify-center rounded-xl border bg-card">
          <p className="text-sm text-muted-foreground">
            {result.error || 'Unable to load client.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <ClientDetailPageClient
      clientId={id}
      initialClient={result.data.client}
      initialSchedules={result.data.schedules}
      initialIsSoloBusiness={result.data.isSoloBusiness}
      initialSoloCrewId={result.data.soloCrewId}
      initialActivity={result.data.activity}
      initialTimezone={result.data.timezone}
    />
  )
}