export interface BillingLineItem {
  id: string
  schedule_id: string
  client_id: string
  company_id: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  created_at: string
}

export interface BillingPayment {
  id: string
  schedule_id: string
  client_id: string
  company_id: string
  amount: number
  payment_date: string
  method: string
  notes: string | null
  source?: 'manual' | 'stripe'
  stripe_payment_intent_id?: string | null
  created_at: string
}

export interface BillingSummary {
  totalCharged: number
  totalPaid: number
  balanceDue: number
}

export interface JobBillingData {
  scheduleId: string
  title: string
  startTime: string
  status: string
  listPrice: number
  lineItems: BillingLineItem[]
  payments: BillingPayment[]
  summary: BillingSummary
}

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
] as const

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function calcBillingSummary(
  lineItems: { amount: number }[],
  payments: { amount: number }[]
): BillingSummary {
  const totalCharged = lineItems.reduce((sum, item) => sum + Number(item.amount), 0)
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  return {
    totalCharged,
    totalPaid,
    balanceDue: totalCharged - totalPaid,
  }
}

export function calcLineAmount(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100
}