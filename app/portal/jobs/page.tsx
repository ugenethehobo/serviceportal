import { getPortalJobsAction } from '@/app/portal/actions'
import { PortalJobsPageClient } from '@/components/portal/portal-jobs-page-client'

export default async function PortalJobsPage() {
  const { jobs, timezone } = await getPortalJobsAction()

  return <PortalJobsPageClient jobs={jobs} timezone={timezone} />
}