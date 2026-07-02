import { calcLineAmount } from '@/lib/billing'

export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'converted'

export interface EstimateLineItem {
  id: string
  estimate_id: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  sort_order: number
  created_at: string
}

export interface Estimate {
  id: string
  client_id: string
  company_id: string
  title: string
  description: string | null
  status: EstimateStatus
  total: number
  schedule_id: string | null
  created_at: string
  updated_at: string
  line_items?: EstimateLineItem[]
  document?: { id: string } | { id: string }[] | null
}

export interface ClientDocument {
  id: string
  client_id: string
  company_id: string
  estimate_id: string | null
  schedule_id: string | null
  name: string
  storage_path: string
  file_type: string
  source: 'estimate' | 'upload'
  created_at: string
}

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  converted: 'Converted',
}

export function calcEstimateTotal(lineItems: { amount: number }[]): number {
  return Math.round(lineItems.reduce((sum, item) => sum + Number(item.amount), 0) * 100) / 100
}

/** Auto-status: draft when empty, sent once line items exist. Preserves accepted/declined/converted. */
export function resolveAutoEstimateStatus(
  currentStatus: EstimateStatus,
  lineItemCount: number
): EstimateStatus {
  if (currentStatus === 'converted') return 'converted'
  if (lineItemCount === 0) return 'draft'
  if (currentStatus === 'draft') return 'sent'
  return currentStatus
}

export function formatEstimateNumber(estimateId: string, createdAt: string): string {
  const date = new Date(createdAt)
  const ymd = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')
  return `EST-${ymd}-${estimateId.slice(0, 8).toUpperCase()}`
}

export { calcLineAmount }