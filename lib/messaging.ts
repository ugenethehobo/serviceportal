export type MessagingSenderRole = 'staff' | 'client'

export type MessagingThread = {
  id: string
  company_id: string
  client_id: string
  schedule_id: string | null
  created_at: string
  updated_at: string
}

export type MessagingMessage = {
  id: string
  thread_id: string
  company_id: string
  sender_user_id: string
  sender_role: MessagingSenderRole
  sender_name: string | null
  body: string
  created_at: string
}

export const MESSAGING_BODY_MAX_LENGTH = 4000
export const MESSAGING_POLL_INTERVAL_MS = 8000

export function formatMessageTime(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getSenderInitials(name: string | null | undefined) {
  const trimmed = name?.trim()
  if (!trimmed) return '?'

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export function normalizeMessageBody(body: string) {
  return body.replace(/\r\n/g, '\n').trim()
}

export type MessagingPerspective = 'staff' | 'client'

export function isOutgoingMessage(
  message: MessagingMessage,
  perspective: MessagingPerspective
) {
  return perspective === 'staff'
    ? message.sender_role === 'staff'
    : message.sender_role === 'client'
}

function namesMatch(a?: string | null, b?: string | null) {
  if (!a || !b) return false
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
}

export function getMessageSenderLabel(
  message: MessagingMessage,
  perspective: MessagingPerspective,
  labels?: { clientName?: string; companyName?: string }
) {
  const clientLabel = labels?.clientName || message.sender_name || 'Client'
  const companyLabel = labels?.companyName || 'Your team'

  if (perspective === 'staff') {
    if (message.sender_role === 'client') {
      return clientLabel
    }

    // Company/staff messages must never display as the client.
    if (labels?.companyName) return labels.companyName
    if (message.sender_name && !namesMatch(message.sender_name, labels?.clientName)) {
      return message.sender_name
    }
    return companyLabel
  }

  if (message.sender_role === 'client') {
    return labels?.clientName || message.sender_name || 'You'
  }

  if (labels?.companyName) return labels.companyName
  if (message.sender_name && !namesMatch(message.sender_name, labels?.clientName)) {
    return message.sender_name
  }

  return 'Your provider'
}

export function validateMessageBody(body: string) {
  const normalized = normalizeMessageBody(body)
  if (!normalized) {
    return { ok: false as const, error: 'Message cannot be empty' }
  }
  if (normalized.length > MESSAGING_BODY_MAX_LENGTH) {
    return {
      ok: false as const,
      error: `Message must be ${MESSAGING_BODY_MAX_LENGTH} characters or fewer`,
    }
  }
  return { ok: true as const, body: normalized }
}