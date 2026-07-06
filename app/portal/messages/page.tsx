import { getPortalMessagingThreadAction } from '@/app/portal/actions'
import { PortalMessagesPageClient } from '@/components/portal/portal-messages-page-client'
import { getPortalShellDataAction } from '@/lib/portal-auth'
import { redirect } from 'next/navigation'

export default async function PortalMessagesPage() {
  const shell = await getPortalShellDataAction()
  if (!shell.success) redirect('/login')

  const threadResult = await getPortalMessagingThreadAction()

  return (
    <PortalMessagesPageClient
      clientName={shell.data.clientName}
      companyName={shell.data.companyName}
      initialMessages={threadResult.success ? threadResult.messages : []}
    />
  )
}