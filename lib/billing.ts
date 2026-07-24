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
  /** Optional link to billing_installments (multi-payment plans). */
  installment_id?: string | null
  created_at: string
}

export interface BillingSummary {
  totalCharged: number
  totalPaid: number
  balanceDue: number
}

export interface JobInvoiceDocument {
  id: string
  name: string
  created_at: string
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
  invoiceDocument?: JobInvoiceDocument | null
  /** Collectibility-aware (from plan or implicit full_balance). */
  amountDueNow?: number
  maxPayableNow?: number
  canPay?: boolean
  /** Present when a job_payment_plans row exists. */
  paymentPlan?: import('@/lib/payment-plans').PlanProgressSummary | null
  /** Banner after attaching plan with existing payments (FIFO note). */
  paymentPlanAllocatedExisting?: boolean
  /** When set, job is part of a recurring series (all_future apply UI). */
  recurringRuleId?: string | null
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

export const OPEN_JOB_STATUSES = ['scheduled', 'in_progress'] as const

export type CompanyPaymentRow = {
  id: string
  scheduleId: string
  clientId: string
  companyId: string
  amount: number
  paymentDate: string
  method: string
  notes: string | null
  source: 'manual' | 'stripe'
  stripePaymentIntentId: string | null
  createdAt: string
  clientName: string
  jobTitle: string
  jobStatus: string
}

export type PaymentsSummary = {
  totalCollected: number
  stripeTotal: number
  manualTotal: number
  paymentCount: number
}

export function sumAmountsBySchedule<T extends { schedule_id: string; amount: number }>(
  items: T[]
): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of items) {
    map.set(item.schedule_id, (map.get(item.schedule_id) || 0) + Number(item.amount))
  }
  return map
}

export function getScheduleBillingSummary(
  scheduleId: string,
  chargedBySchedule: Map<string, number>,
  paidBySchedule: Map<string, number>
): BillingSummary {
  const totalCharged = chargedBySchedule.get(scheduleId) || 0
  const totalPaid = paidBySchedule.get(scheduleId) || 0
  return {
    totalCharged,
    totalPaid,
    balanceDue: Math.round((totalCharged - totalPaid) * 100) / 100,
  }
}

export function computeOpenJobBalancesByClient(
  schedules: Array<{ id: string; client_id: string; status: string }>,
  lineItems: Array<{ schedule_id: string; amount: number }>,
  payments: Array<{ schedule_id: string; amount: number }>
) {
  const charged = sumAmountsBySchedule(lineItems)
  const paid = sumAmountsBySchedule(payments)
  const byClient = new Map<string, number>()
  let total = 0

  for (const schedule of schedules) {
    if (!OPEN_JOB_STATUSES.includes(schedule.status as (typeof OPEN_JOB_STATUSES)[number])) {
      continue
    }
    const { balanceDue } = getScheduleBillingSummary(schedule.id, charged, paid)
    if (balanceDue <= 0) continue
    total += balanceDue
    byClient.set(schedule.client_id, (byClient.get(schedule.client_id) || 0) + balanceDue)
  }

  return { total: Math.round(total * 100) / 100, byClient }
}

export function computeClientBillingTotals(
  schedules: Array<{ id: string; client_id: string; status: string }>,
  lineItems: Array<{ schedule_id: string; amount: number }>,
  payments: Array<{ schedule_id: string; amount: number }>
) {
  const charged = sumAmountsBySchedule(lineItems)
  const paid = sumAmountsBySchedule(payments)
  const byClient = new Map<string, { totalCharged: number; totalPaid: number }>()

  for (const schedule of schedules) {
    if (schedule.status === 'cancelled') continue
    const summary = getScheduleBillingSummary(schedule.id, charged, paid)
    const entry = byClient.get(schedule.client_id) || { totalCharged: 0, totalPaid: 0 }
    entry.totalCharged += summary.totalCharged
    entry.totalPaid += summary.totalPaid
    byClient.set(schedule.client_id, entry)
  }

  return byClient
}

export function summarizePayments(
  payments: Array<{ amount: number; source?: string | null }>
): PaymentsSummary {
  let stripeTotal = 0
  let manualTotal = 0

  for (const payment of payments) {
    const amount = Number(payment.amount)
    if (payment.source === 'stripe') {
      stripeTotal += amount
    } else {
      manualTotal += amount
    }
  }

  return {
    totalCollected: Math.round((stripeTotal + manualTotal) * 100) / 100,
    stripeTotal: Math.round(stripeTotal * 100) / 100,
    manualTotal: Math.round(manualTotal * 100) / 100,
    paymentCount: payments.length,
  }
}