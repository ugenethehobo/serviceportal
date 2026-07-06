import { getClientEstimatesAction } from '@/app/action'
import { PortalEstimatesPageClient } from '@/components/portal/portal-estimates-page-client'
import { getPortalShellDataAction } from '@/lib/portal-auth'
import type { Estimate } from '@/lib/estimates'
import { redirect } from 'next/navigation'

export default async function PortalEstimatesPage() {
  const shell = await getPortalShellDataAction()
  if (!shell.success) redirect('/login')

  const result = await getClientEstimatesAction(shell.data.clientId)
  const estimates = result.success ? ((result.estimates || []) as Estimate[]) : []

  return <PortalEstimatesPageClient estimates={estimates} />
}