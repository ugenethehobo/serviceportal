import { getClientsListAction } from '@/app/action'
import { ClientsPageClient } from '@/components/dashboard/clients-page-client'

export default async function ClientsPage() {
  const result = await getClientsListAction()

  if (!result.success) {
    return (
      <div className="p-6 flex flex-col h-full min-h-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
        </div>
        <div className="flex-1 flex items-center justify-center rounded-xl border bg-card">
          <p className="text-sm text-muted-foreground">
            {result.error || 'Unable to load clients.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <ClientsPageClient
      initialClients={result.data}
      initialPagination={result.pagination}
    />
  )
}