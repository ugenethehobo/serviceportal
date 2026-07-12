import { getPortalDocumentsPageDataAction } from '@/app/portal/actions'
import { ClientDocumentsPanel } from '@/components/dashboard/client-documents-panel'
import { PortalPageHeader } from '@/components/portal/portal-page-header'
import { MainPageCard } from '@/components/ui/main-page-card'
import { getPortalShellDataAction } from '@/lib/portal-auth'
import { redirect } from 'next/navigation'

export default async function PortalDocumentsPage() {
  const shell = await getPortalShellDataAction()
  if (!shell.success) redirect('/login')

  const result = await getPortalDocumentsPageDataAction()

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <PortalPageHeader
        title="Documents"
        description="Browse invoices, estimates, contracts, and files organized by job folder."
      />

      <MainPageCard className="p-5 shadow-sm">
        <ClientDocumentsPanel
          clientId={shell.data.clientId}
          variant="portal"
          initialDocuments={result.success ? result.documents : []}
          initialJobs={result.success ? result.jobs : []}
        />
      </MainPageCard>
    </div>
  )
}