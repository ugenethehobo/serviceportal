import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getPortalJobBillingAction, getPortalPhotosPageDataAction } from '@/app/portal/actions'
import { PortalJobDetail } from '@/components/portal/portal-job-detail'

export default async function PortalJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [result, photosResult] = await Promise.all([
    getPortalJobBillingAction(id),
    getPortalPhotosPageDataAction({ scheduleId: id }),
  ])
  if (!result.success) notFound()

  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading job...</div>}>
      <PortalJobDetail
        jobId={id}
        clientId={result.clientId}
        billing={result.billing}
        timezone={result.timezone}
        initialPhotos={photosResult.success ? photosResult.photos : []}
        initialPhotoCategories={photosResult.success ? photosResult.categories : []}
      />
    </Suspense>
  )
}