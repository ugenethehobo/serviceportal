import { getPortalPhotosPageDataAction } from '@/app/portal/actions'
import { ClientPhotosPanel } from '@/components/dashboard/client-photos-panel'
import { PortalPageHeader } from '@/components/portal/portal-page-header'
import { MainPageCard } from '@/components/ui/main-page-card'
import { getPortalShellDataAction } from '@/lib/portal-auth'
import { redirect } from 'next/navigation'

export default async function PortalPhotosPage() {
  const shell = await getPortalShellDataAction()
  if (!shell.success) redirect('/login')

  const result = await getPortalPhotosPageDataAction()

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <PortalPageHeader
        title="Photos"
        description="Job site photos from your service visits, organized by job and category."
      />

      <MainPageCard className="p-5 shadow-sm">
        <ClientPhotosPanel
          clientId={shell.data.clientId}
          variant="portal"
          initialPhotos={result.success ? result.photos : []}
          initialJobs={result.success ? result.jobs : []}
          initialCategories={result.success ? result.categories : []}
        />
      </MainPageCard>
    </div>
  )
}