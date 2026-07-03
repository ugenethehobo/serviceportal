import { structuredAddressFromRow, type StructuredAddress } from '@/lib/address'

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'won',
  'lost',
  'archived',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_PIPELINE_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'won',
  'lost',
] as const

export type LeadPipelineStatus = (typeof LEAD_PIPELINE_STATUSES)[number]

export const LEAD_SOURCES = [
  'website',
  'referral',
  'phone',
  'social',
  'other',
] as const

export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_PRIORITIES = ['low', 'normal', 'high'] as const

export type LeadPriority = (typeof LEAD_PRIORITIES)[number]

export const LEAD_ACTIVITY_TYPES = [
  'note',
  'status_change',
  'follow_up_set',
  'converted',
  'archived',
  'restored',
] as const

export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number]

export type Lead = {
  id: string
  company_id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  address_street: string | null
  address_unit: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  source: LeadSource
  status: LeadStatus
  priority: LeadPriority
  follow_up_at: string | null
  notes: string | null
  estimated_value: number | null
  converted_client_id: string | null
  converted_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type LeadActivity = {
  id: string
  lead_id: string
  company_id: string
  type: LeadActivityType
  body: string | null
  created_by: string | null
  created_at: string
  creator_name?: string | null
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  won: 'Won',
  lost: 'Lost',
  archived: 'Archived',
}

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website: 'Website',
  referral: 'Referral',
  phone: 'Phone',
  social: 'Social',
  other: 'Other',
}

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
}

export type FollowUpUrgency = 'none' | 'overdue' | 'today' | 'upcoming'

export function structuredAddressFromLeadRow(lead: Lead): StructuredAddress {
  return structuredAddressFromRow(lead)
}

export function sortLeadsByPriority(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    const aFollow = a.follow_up_at ? new Date(a.follow_up_at).getTime() : Number.POSITIVE_INFINITY
    const bFollow = b.follow_up_at ? new Date(b.follow_up_at).getTime() : Number.POSITIVE_INFINITY
    if (aFollow !== bFollow) return aFollow - bFollow
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

function startOfLocalDay(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfLocalDay(date = new Date()) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function getFollowUpUrgency(followUpAt: string | null | undefined): FollowUpUrgency {
  if (!followUpAt) return 'none'
  const target = new Date(followUpAt)
  const now = new Date()
  if (target < startOfLocalDay(now)) return 'overdue'
  if (target <= endOfLocalDay(now)) return 'today'
  return 'upcoming'
}

export function formatFollowUpLabel(followUpAt: string | null | undefined): string {
  if (!followUpAt) return 'No follow-up'
  const urgency = getFollowUpUrgency(followUpAt)
  const formatted = new Date(followUpAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  if (urgency === 'overdue') return `Overdue · ${formatted}`
  if (urgency === 'today') return `Today · ${formatted}`
  return formatted
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export function isActiveLeadStatus(status: LeadStatus) {
  return status !== 'archived'
}