export type InvoiceTemplateBlockType =
  | 'company_header'
  | 'invoice_meta'
  | 'bill_to'
  | 'job_details'
  | 'line_items'
  | 'payments'
  | 'totals'
  | 'footer'

export type InvoiceTemplateBlock = {
  id: string
  type: InvoiceTemplateBlockType
  enabled: boolean
  label?: string
}

export type InvoiceTemplate = {
  blocks: InvoiceTemplateBlock[]
  footerText: string
  showPayments: boolean
}

export const INVOICE_TEMPLATE_BLOCK_LABELS: Record<InvoiceTemplateBlockType, string> = {
  company_header: 'Company header',
  invoice_meta: 'Invoice number & date',
  bill_to: 'Bill to',
  job_details: 'Job details',
  line_items: 'Line items table',
  payments: 'Payments',
  totals: 'Totals & balance due',
  footer: 'Footer note',
}

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplate = {
  blocks: [
    { id: 'company', type: 'company_header', enabled: true },
    { id: 'meta', type: 'invoice_meta', enabled: true },
    { id: 'bill', type: 'bill_to', enabled: true, label: 'Bill To' },
    { id: 'job', type: 'job_details', enabled: true },
    { id: 'lines', type: 'line_items', enabled: true },
    { id: 'pay', type: 'payments', enabled: true },
    { id: 'totals', type: 'totals', enabled: true },
    { id: 'footer', type: 'footer', enabled: true },
  ],
  footerText:
    'Pay online through your client portal or contact us with questions.',
  showPayments: true,
}

export function normalizeInvoiceTemplate(input: unknown): InvoiceTemplate {
  if (!input || typeof input !== 'object') {
    return DEFAULT_INVOICE_TEMPLATE
  }

  const raw = input as Partial<InvoiceTemplate>
  const blocks = Array.isArray(raw.blocks) ? raw.blocks : DEFAULT_INVOICE_TEMPLATE.blocks

  const normalizedBlocks: InvoiceTemplateBlock[] = []
  const seenTypes = new Set<InvoiceTemplateBlockType>()

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    const type = (block as InvoiceTemplateBlock).type
    if (!type || !INVOICE_TEMPLATE_BLOCK_LABELS[type]) continue
    if (seenTypes.has(type)) continue
    seenTypes.add(type)
    normalizedBlocks.push({
      id: String((block as InvoiceTemplateBlock).id || type),
      type,
      enabled: (block as InvoiceTemplateBlock).enabled !== false,
      label:
        typeof (block as InvoiceTemplateBlock).label === 'string'
          ? (block as InvoiceTemplateBlock).label
          : undefined,
    })
  }

  for (const defaultBlock of DEFAULT_INVOICE_TEMPLATE.blocks) {
    if (!seenTypes.has(defaultBlock.type)) {
      normalizedBlocks.push({ ...defaultBlock })
    }
  }

  const lineItemsIndex = normalizedBlocks.findIndex((b) => b.type === 'line_items')
  if (lineItemsIndex === -1) {
    const jobIndex = normalizedBlocks.findIndex((b) => b.type === 'job_details')
    normalizedBlocks.splice(jobIndex >= 0 ? jobIndex + 1 : normalizedBlocks.length, 0, {
      id: 'lines',
      type: 'line_items',
      enabled: true,
    })
  }

  return {
    blocks: normalizedBlocks,
    footerText:
      typeof raw.footerText === 'string' && raw.footerText.trim()
        ? raw.footerText.trim()
        : DEFAULT_INVOICE_TEMPLATE.footerText,
    showPayments: raw.showPayments !== false,
  }
}

export function getEnabledTemplateBlocks(template: InvoiceTemplate) {
  return template.blocks.filter((block) => block.enabled)
}