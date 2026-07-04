'use client'

import { useMemo, useState } from 'react'
import {
  getMessagingThreadAction,
  sendMessagingMessageAction,
} from '@/app/action'
import { MessagingThreadPanel } from '@/components/dashboard/messaging-thread-panel'

interface JobMessagingPanelProps {
  clientId: string
  scheduleId: string
  jobTitle?: string
  clientName?: string
}

export function JobMessagingPanel({
  clientId,
  scheduleId,
  jobTitle,
  clientName,
}: JobMessagingPanelProps) {
  const [companyName, setCompanyName] = useState<string | undefined>()
  const [resolvedClientName, setResolvedClientName] = useState<string | undefined>(
    clientName
  )

  const loadMessages = useMemo(
    () => async () => {
      const result = await getMessagingThreadAction(clientId, scheduleId)
      if (!result.success) {
        return { success: false as const, error: result.error }
      }
      setCompanyName(result.companyName || undefined)
      setResolvedClientName(result.clientName || clientName)
      return { success: true as const, messages: result.messages }
    },
    [clientId, scheduleId, clientName]
  )

  const sendMessage = useMemo(
    () => async (body: string) =>
      sendMessagingMessageAction(clientId, body, scheduleId),
    [clientId, scheduleId]
  )

  return (
    <MessagingThreadPanel
      perspective="staff"
      clientName={resolvedClientName}
      companyName={companyName}
      title="Job messages"
      subtitle={
        jobTitle
          ? `Messages about ${jobTitle} with the client and your team.`
          : 'Messages about this job with the client and your team.'
      }
      emptyHint="Send the first message about this job."
      className="flex-1 min-h-0"
      loadMessages={loadMessages}
      sendMessage={sendMessage}
    />
  )
}