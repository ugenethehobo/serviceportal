'use client'

import { useMemo, useState } from 'react'
import {
  getMessagingThreadAction,
  sendMessagingMessageAction,
} from '@/app/action'
import { MessagingThreadPanel } from '@/components/dashboard/messaging-thread-panel'

interface ClientMessagingPanelProps {
  clientId: string
  clientName?: string
}

export function ClientMessagingPanel({ clientId, clientName }: ClientMessagingPanelProps) {
  const [companyName, setCompanyName] = useState<string | undefined>()
  const [resolvedClientName, setResolvedClientName] = useState<string | undefined>(
    clientName
  )

  const loadMessages = useMemo(
    () => async () => {
      const result = await getMessagingThreadAction(clientId)
      if (!result.success) {
        return { success: false as const, error: result.error }
      }
      setCompanyName(result.companyName || undefined)
      setResolvedClientName(result.clientName || clientName)
      return { success: true as const, messages: result.messages }
    },
    [clientId, clientName]
  )

  const sendMessage = useMemo(
    () => async (body: string) => sendMessagingMessageAction(clientId, body),
    [clientId]
  )

  return (
    <MessagingThreadPanel
      perspective="staff"
      clientName={resolvedClientName}
      companyName={companyName}
      title="Client messages"
      subtitle={
        clientName
          ? `Conversation with ${clientName} through the client portal.`
          : 'Conversation with this client through the client portal.'
      }
      emptyHint="Send the first message to start a conversation with this client."
      className="flex-1 min-h-0"
      loadMessages={loadMessages}
      sendMessage={sendMessage}
    />
  )
}