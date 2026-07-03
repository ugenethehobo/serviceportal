import { getPortalJobsAction } from '@/app/portal/actions'
import { PortalJobsPageClient } from '@/components/portal/portal-jobs-page-client'
import type { PortalJobListItem } from '@/components/portal/portal-jobs-list'

export default async function PortalJobsPage() {
  const { jobs } = await getPortalJobsAction()

  return <PortalJobsPageClient jobs={jobs as PortalJobListItem[]} />
}