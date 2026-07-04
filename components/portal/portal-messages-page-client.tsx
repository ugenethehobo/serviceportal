'use client'

import { useMemo } from 'react'
import {
  getPortalMessagingThreadAction,
  sendPortalMessagingMessageAction,
} from '@/app/portal/actions'
import { MessagingThreadPanel } from '@/components/dashboard/messaging-thread-panel'
import { PortalPageHeader } from '@/components/portal/portal-page-header'


interface PortalMessagesPageClientProps {
  clientName: string
  companyName: string
}

export function PortalMessagesPageClient({
  clientName,
  companyName,
}: PortalMessagesPageClientProps) {

  const loadMessages = useMemo(
    () => async () => {
      const result = await getPortalMessagingThreadAction()
      if (!result.success) {
        return { success: false as const, error: result.error }
      }
      return { success: true as const, messages: result.messages }
    },
    []
  )

  const sendMessage = useMemo(
    () => async (body: string) => sendPortalMessagingMessageAction(body),
    []
  )

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <PortalPageHeader
        title="Messages"
        description={`Chat with ${companyName} about your account, jobs, and estimates.`}
      />

      <MessagingThreadPanel
        perspective="client"
        clientName={clientName}
        companyName={companyName}
        subtitle={`Signed in as ${clientName}`}
        emptyHint="Send a message to your service provider. They will reply here in the portal."
        className="flex-1 min-h-0"
        loadMessages={loadMessages}
        sendMessage={sendMessage}
      />
    </div>
  )
}