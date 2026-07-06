import { getSessionProfile } from '@/lib/portal-auth'
import { PortalPageHeader } from '@/components/portal/portal-page-header'
import { ClientDocumentsPanel } from '@/components/dashboard/client-documents-panel'
import { MainPageCard } from '@/components/ui/main-page-card'

export default async function PortalDocumentsPage() {
  const session = await getSessionProfile()
  if (!session?.profile.client_id) return null

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <PortalPageHeader
        title="Documents"
        description="Browse invoices, estimates, and files organized by job folder."
      />

      <MainPageCard className="p-5 shadow-sm">
        <ClientDocumentsPanel
          clientId={session.profile.client_id}
          variant="portal"
        />
      </MainPageCard>
    </div>
  )
}