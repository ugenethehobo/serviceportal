import { getPortalHomeData } from '@/app/portal/actions'
import { PortalHomeClient } from '@/components/portal/portal-home-client'

export default async function PortalHomePage() {
  const data = await getPortalHomeData()

  return (
    <PortalHomeClient
      clientId={data.clientId}
      timezone={data.timezone}
      activeJobs={data.activeJobs}
      upcomingJobs={data.upcomingJobs}
      upcomingJobCount={data.upcomingJobCount}
      balanceDue={data.balanceDue}
      balanceDueFormatted={data.balanceDueFormatted}
      payableJobs={data.payableJobs}
      activity={data.activity}
    />
  )
}