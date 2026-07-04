import {
  getScheduleBillingSummary,
  sumAmountsBySchedule,
  type BillingSummary,
} from '@/lib/billing'

export type ArAgingBucket = 'current' | '31_60' | '61_90' | 'over_90'

export const AR_AGING_BUCKET_LABELS: Record<ArAgingBucket, string> = {
  current: 'Current (0–30 days)',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  over_90: '90+ days',
}

export type ArAgingBucketSummary = {
  bucket: ArAgingBucket
  label: string
  amount: number
  invoiceCount: number
}

export type ArAgingInvoiceRow = {
  scheduleId: string
  clientId: string
  clientName: string
  jobTitle: string
  balanceDue: number
  daysOutstanding: number
  bucket: ArAgingBucket
  dueDate: string
  invoiceDocumentId: string | null
}

export type ArAgingData = {
  totalOutstanding: number
  buckets: ArAgingBucketSummary[]
  invoices: ArAgingInvoiceRow[]
}

type RawSchedule = {
  id: string
  client_id: string
  title: string
  status: string
  start_time: string
  end_time: string
}

type RawLineItem = {
  schedule_id: string
  amount: number
  created_at: string
}

type RawPayment = {
  schedule_id: string
  amount: number
}

type InvoiceDocumentMeta = {
  schedule_id: string
  id: string
  created_at: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function getArAgingBucket(daysOutstanding: number): ArAgingBucket {
  if (daysOutstanding <= 30) return 'current'
  if (daysOutstanding <= 60) return '31_60'
  if (daysOutstanding <= 90) return '61_90'
  return 'over_90'
}

function earliestLineItemDate(lineItems: RawLineItem[], scheduleId: string): string | null {
  let earliest: string | null = null
  for (const item of lineItems) {
    if (item.schedule_id !== scheduleId) continue
    if (!earliest || item.created_at < earliest) {
      earliest = item.created_at
    }
  }
  return earliest
}

function resolveInvoiceDueDate(
  schedule: RawSchedule,
  lineItems: RawLineItem[],
  invoiceDoc: InvoiceDocumentMeta | undefined
): string {
  if (invoiceDoc?.created_at) return invoiceDoc.created_at
  if (schedule.status === 'archived' && schedule.end_time) return schedule.end_time
  const firstLine = earliestLineItemDate(lineItems, schedule.id)
  if (firstLine) return firstLine
  return schedule.start_time || new Date().toISOString()
}

export function buildArAgingData(input: {
  schedules: RawSchedule[]
  lineItems: RawLineItem[]
  payments: RawPayment[]
  clients: Array<{ id: string; name: string }>
  invoiceDocuments: InvoiceDocumentMeta[]
  now?: Date
}): ArAgingData {
  const now = input.now ?? new Date()
  const charged = sumAmountsBySchedule(input.lineItems)
  const paid = sumAmountsBySchedule(input.payments)
  const clientNameById = new Map(input.clients.map((client) => [client.id, client.name]))
  const invoiceDocBySchedule = new Map(
    input.invoiceDocuments.map((doc) => [doc.schedule_id, doc])
  )

  const bucketTotals = new Map<ArAgingBucket, { amount: number; count: number }>([
    ['current', { amount: 0, count: 0 }],
    ['31_60', { amount: 0, count: 0 }],
    ['61_90', { amount: 0, count: 0 }],
    ['over_90', { amount: 0, count: 0 }],
  ])

  const invoices: ArAgingInvoiceRow[] = []
  let totalOutstanding = 0

  for (const schedule of input.schedules) {
    if (schedule.status === 'cancelled') continue

    const summary: BillingSummary = getScheduleBillingSummary(schedule.id, charged, paid)
    if (summary.balanceDue <= 0) continue

    const dueDate = resolveInvoiceDueDate(
      schedule,
      input.lineItems,
      invoiceDocBySchedule.get(schedule.id)
    )
    const daysOutstanding = Math.max(
      0,
      Math.floor((now.getTime() - new Date(dueDate).getTime()) / MS_PER_DAY)
    )
    const bucket = getArAgingBucket(daysOutstanding)
    const invoiceDoc = invoiceDocBySchedule.get(schedule.id)

    totalOutstanding += summary.balanceDue
    const bucketEntry = bucketTotals.get(bucket)!
    bucketEntry.amount += summary.balanceDue
    bucketEntry.count += 1

    invoices.push({
      scheduleId: schedule.id,
      clientId: schedule.client_id,
      clientName: clientNameById.get(schedule.client_id) || 'Unknown client',
      jobTitle: schedule.title || 'Job',
      balanceDue: summary.balanceDue,
      daysOutstanding,
      bucket,
      dueDate,
      invoiceDocumentId: invoiceDoc?.id ?? null,
    })
  }

  invoices.sort((a, b) => b.daysOutstanding - a.daysOutstanding || b.balanceDue - a.balanceDue)

  const buckets: ArAgingBucketSummary[] = (
    ['current', '31_60', '61_90', 'over_90'] as ArAgingBucket[]
  ).map((bucket) => {
    const entry = bucketTotals.get(bucket)!
    return {
      bucket,
      label: AR_AGING_BUCKET_LABELS[bucket],
      amount: Math.round(entry.amount * 100) / 100,
      invoiceCount: entry.count,
    }
  })

  return {
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    buckets,
    invoices,
  }
}