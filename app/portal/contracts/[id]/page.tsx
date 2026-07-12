import { getPortalContractSigningPageAction } from '@/app/portal/contract-actions'
import { PortalContractSigningClient } from '@/components/portal/portal-contract-signing-client'
import { getPortalShellDataAction } from '@/lib/portal-auth'
import { redirect } from 'next/navigation'

export default async function PortalContractSigningPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const shell = await getPortalShellDataAction()
  if (!shell.success) redirect('/login')

  const { id } = await params
  const result = await getPortalContractSigningPageAction(id)

  if (!result.success) {
    redirect('/portal/documents')
  }

  return <PortalContractSigningClient contractId={id} initialData={result.data} />
}