import { formatCurrency } from '@/lib/billing'
import {
  sortActivityItems,
  type ActivityFeedItem,
} from '@/lib/activity-feed'
import {
  buildPortalActivity,
  type PortalActivityItem,
} from '@/lib/portal-activity'

export type StaffActivityType =
  | 'payment_received'
  | 'contract_signed'
  | 'contract_awaiting_signature'
  | 'estimate_accepted'
  | 'estimate_declined'
  | 'estimate_sent'
  | 'lead_follow_up_due'
  | 'client_message'
  | 'estimate_review'
  | 'contract_signing'
  | 'payment_due'
  | 'visit_upcoming'

type ClientRef = { id: string; name: string }

type RawPayment = {
  id: string
  client_id: string
  schedule_id: string
  amount: number
  source?: string | null
  created_at: string
  client?: ClientRef | ClientRef[] | null
}

type RawContract = {
  id: string
  client_id: string
  schedule_id: string | null
  title: string
  status: string
  sent_at: string | null
  updated_at: string
  client_signed_at: string | null
  client?: ClientRef | ClientRef[] | null
}

type RawEstimate = {
  id: string
  client_id: string
  title: string
  total: number
  status: string
  updated_at: string
  client?: ClientRef | ClientRef[] | null
}

type RawLead = {
  id: string
  name: string
  follow_up_at: string | null
  status: string
}

type RawClientMessage = {
  id: string
  body: string
  created_at: string
  thread?: {
    client_id: string
    client?: ClientRef | ClientRef[] | null
  } | {
    client_id: string
    client?: ClientRef | ClientRef[] | null
  }[] | null
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function clientName(client: ClientRef | ClientRef[] | null | undefined, fallback = 'Client') {
  return unwrapRelation(client)?.name || fallback
}

export function staffClientHref(clientId: string, tab?: string) {
  const base = `/dashboard/clients/${clientId}`
  return tab ? `${base}?tab=${tab}` : base
}

export function staffJobHref(clientId: string, scheduleId: string) {
  return `/dashboard/clients/${clientId}/jobs/${scheduleId}`
}

export function staffContractHref(
  clientId: string,
  contract: { id: string; schedule_id: string | null }
) {
  if (contract.schedule_id) {
    return staffJobHref(clientId, contract.schedule_id)
  }
  return staffClientHref(clientId, 'documents')
}

export function mapPortalActivityForStaff(
  items: PortalActivityItem[],
  clientId: string
): ActivityFeedItem[] {
  return items.map((item) => {
    let title = item.title
    let href = item.href
    let urgent = item.urgent

    switch (item.type) {
      case 'estimate_review':
        title = 'Estimate awaiting client review'
        href = staffClientHref(clientId, 'estimates')
        urgent = true
        break
      case 'contract_signing':
        title = 'Contract awaiting client signature'
        href = staffClientHref(clientId, 'documents')
        urgent = true
        break
      case 'contract_signed':
        href = staffClientHref(clientId, 'documents')
        break
      case 'payment_due':
        title = 'Client balance due'
        href = staffClientHref(clientId, 'billing')
        urgent = true
        break
      case 'payment_received': {
        const jobId = item.href.split('/portal/jobs/')[1]?.split('?')[0]
        href = jobId ? staffJobHref(clientId, jobId) : staffClientHref(clientId, 'billing')
        break
      }
      case 'visit_upcoming': {
        const jobId = item.href.split('/portal/jobs/')[1]?.split('?')[0]
        href = jobId ? staffJobHref(clientId, jobId) : staffClientHref(clientId, 'jobs')
        break
      }
      default:
        href = staffClientHref(clientId)
    }

    return {
      id: `staff-${item.id}`,
      type: item.type,
      title,
      description: item.description,
      href,
      occurredAt: item.occurredAt,
      urgent,
    }
  })
}

export function buildCompanyActivity(input: {
  payments: RawPayment[]
  contracts: RawContract[]
  estimates: RawEstimate[]
  leads: RawLead[]
  messages: RawClientMessage[]
  now?: Date
  limit?: number
}): ActivityFeedItem[] {
  const now = input.now ?? new Date()
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)
  const items: ActivityFeedItem[] = []

  for (const payment of input.payments) {
    const name = clientName(payment.client)
    items.push({
      id: `payment-${payment.id}`,
      type: 'payment_received',
      title: payment.source === 'stripe' ? 'Online payment received' : 'Payment recorded',
      description: `${name} — ${formatCurrency(Number(payment.amount))}`,
      href: staffJobHref(payment.client_id, payment.schedule_id),
      occurredAt: payment.created_at,
    })
  }

  for (const contract of input.contracts) {
    const name = clientName(contract.client)
    if (contract.status === 'ready_for_signing') {
      items.push({
        id: `contract-awaiting-${contract.id}`,
        type: 'contract_awaiting_signature',
        title: 'Contract awaiting client signature',
        description: `${name} — ${contract.title}`,
        href: staffContractHref(contract.client_id, contract),
        occurredAt: contract.sent_at || contract.updated_at,
        urgent: true,
      })
      continue
    }

    if (contract.status === 'signed' && contract.client_signed_at) {
      items.push({
        id: `contract-signed-${contract.id}`,
        type: 'contract_signed',
        title: 'Contract signed',
        description: `${name} — ${contract.title}`,
        href: staffContractHref(contract.client_id, contract),
        occurredAt: contract.client_signed_at,
      })
    }
  }

  for (const estimate of input.estimates) {
    const name = clientName(estimate.client)
    if (estimate.status === 'accepted') {
      items.push({
        id: `estimate-accepted-${estimate.id}`,
        type: 'estimate_accepted',
        title: 'Estimate accepted',
        description: `${name} — ${estimate.title}`,
        href: staffClientHref(estimate.client_id, 'estimates'),
        occurredAt: estimate.updated_at,
        urgent: true,
      })
      continue
    }

    if (estimate.status === 'declined') {
      items.push({
        id: `estimate-declined-${estimate.id}`,
        type: 'estimate_declined',
        title: 'Estimate declined',
        description: `${name} — ${estimate.title}`,
        href: staffClientHref(estimate.client_id, 'estimates'),
        occurredAt: estimate.updated_at,
        urgent: true,
      })
      continue
    }

    if (estimate.status === 'sent') {
      items.push({
        id: `estimate-sent-${estimate.id}`,
        type: 'estimate_sent',
        title: 'Estimate awaiting client review',
        description: `${name} — ${formatCurrency(Number(estimate.total))}`,
        href: staffClientHref(estimate.client_id, 'estimates'),
        occurredAt: estimate.updated_at,
        urgent: true,
      })
    }
  }

  for (const lead of input.leads) {
    if (!lead.follow_up_at) continue
    const followUpAt = new Date(lead.follow_up_at)
    if (followUpAt.getTime() > endOfDay.getTime()) continue
    if (['archived', 'won', 'lost'].includes(lead.status)) continue

    items.push({
      id: `lead-follow-up-${lead.id}`,
      type: 'lead_follow_up_due',
      title: 'Lead follow-up due',
      description: lead.name,
      href: `/dashboard/leads?lead=${lead.id}`,
      occurredAt: lead.follow_up_at,
      urgent: true,
    })
  }

  for (const message of input.messages) {
    const thread = unwrapRelation(message.thread)
    if (!thread?.client_id) continue
    const name = clientName(thread.client)
    const preview = message.body.trim().slice(0, 80)
    items.push({
      id: `message-${message.id}`,
      type: 'client_message',
      title: 'Message from client',
      description: `${name} — ${preview}${message.body.length > 80 ? '…' : ''}`,
      href: staffClientHref(thread.client_id, 'messaging'),
      occurredAt: message.created_at,
      urgent: true,
    })
  }

  return sortActivityItems(items, input.limit ?? 50)
}

export function buildClientActivityForStaff(input: Parameters<typeof buildPortalActivity>[0] & {
  clientId: string
  staffEstimates?: RawEstimate[]
}): ActivityFeedItem[] {
  const portalItems = buildPortalActivity(input)
  const mapped = mapPortalActivityForStaff(portalItems, input.clientId)

  const seen = new Set(mapped.map((item) => item.id))

  for (const estimate of input.staffEstimates || []) {
    if (estimate.status === 'accepted') {
      const id = `staff-estimate-accepted-${estimate.id}`
      if (!seen.has(id)) {
        mapped.push({
          id,
          type: 'estimate_accepted',
          title: 'Estimate accepted',
          description: estimate.title,
          href: staffClientHref(input.clientId, 'estimates'),
          occurredAt: estimate.updated_at,
          urgent: true,
        })
      }
    } else if (estimate.status === 'declined') {
      const id = `staff-estimate-declined-${estimate.id}`
      if (!seen.has(id)) {
        mapped.push({
          id,
          type: 'estimate_declined',
          title: 'Estimate declined',
          description: estimate.title,
          href: staffClientHref(input.clientId, 'estimates'),
          occurredAt: estimate.updated_at,
          urgent: true,
        })
      }
    }
  }

  return sortActivityItems(mapped, input.limit ?? 50)
}