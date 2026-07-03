import { getClientEstimatesAction } from '@/app/action'
import { getSessionProfile } from '@/lib/portal-auth'
import { PortalEstimatesPageClient } from '@/components/portal/portal-estimates-page-client'
import type { Estimate } from '@/lib/estimates'

export default async function PortalEstimatesPage() {
  const session = await getSessionProfile()
  if (!session?.profile.client_id) return null

  const result = await getClientEstimatesAction(session.profile.client_id)
  const estimates = result.success ? (result.estimates || []) as Estimate[] : []

  return <PortalEstimatesPageClient estimates={estimates} />
}