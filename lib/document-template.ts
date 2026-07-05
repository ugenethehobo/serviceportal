import {
  DEFAULT_INVOICE_TEMPLATE,
  normalizeInvoiceTemplate,
  type InvoiceTemplate,
  type InvoiceTemplateBlockType,
} from '@/lib/invoice-template'

export type DocumentKind = 'invoice' | 'estimate'

export type DocumentElementKind = 'field' | 'text' | 'image' | 'table' | 'line'

export type DocumentElementLayout = 'flow' | 'absolute'

export type DocumentElement = {
  id: string
  kind: DocumentElementKind
  x: number
  y: number
  width?: number
  height?: number
  visible: boolean
  locked?: boolean
  layout?: DocumentElementLayout
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  color?: string
  align?: 'left' | 'center' | 'right'
  fieldKey?: string
  label?: string
  text?: string
  format?: 'currency' | 'date' | 'plain'
}

export type DocumentBrandColors = {
  primary?: string
  accent?: string
  muted?: string
  border?: string
}

export type DocumentTableColumns = {
  qty: number
  unit: number
  amount: number
}

export type DocumentTemplatePreset = 'classic' | 'compact' | 'custom'

export type DocumentTemplate = {
  version: 2
  page: { width: number; height: number }
  elements: DocumentElement[]
  showPayments?: boolean
  footerDueText?: string
  footerPaidText?: string
  brandColors?: DocumentBrandColors
  tableColumns?: DocumentTableColumns
  preset?: DocumentTemplatePreset
}

export const DEFAULT_BRAND_COLORS: DocumentBrandColors = {
  primary: '#1a1a1a',
  accent: '#1a7340',
  muted: '#595959',
  border: '#d9d9d9',
}

export const DEFAULT_TABLE_COLUMNS: DocumentTableColumns = {
  qty: 280,
  unit: 340,
  amount: 420,
}

const COMPANY_LOGO_ELEMENT: DocumentElement = {
  id: 'company-logo',
  kind: 'image',
  fieldKey: 'company.logo',
  x: 442,
  y: 42,
  width: 110,
  height: 52,
  visible: false,
  layout: 'absolute',
}

export type CompanyDocumentTemplates = {
  invoice: DocumentTemplate
  estimate: DocumentTemplate
}

export const DOCUMENT_PAGE = {
  width: 612,
  height: 792,
} as const

export const DEFAULT_INVOICE_DOCUMENT_TEMPLATE: DocumentTemplate = {
  version: 2,
  page: { ...DOCUMENT_PAGE },
  showPayments: true,
  footerDueText: DEFAULT_INVOICE_TEMPLATE.footerText,
  footerPaidText: 'Paid in full — thank you for your business.',
  brandColors: { ...DEFAULT_BRAND_COLORS },
  tableColumns: { ...DEFAULT_TABLE_COLUMNS },
  preset: 'classic',
  elements: [
    { ...COMPANY_LOGO_ELEMENT },
    {
      id: 'company-name',
      kind: 'field',
      fieldKey: 'company.name',
      x: 50,
      y: 50,
      fontSize: 20,
      fontWeight: 'bold',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'company-address',
      kind: 'field',
      fieldKey: 'company.address',
      x: 50,
      y: 76,
      fontSize: 10,
      color: '#595959',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'company-phone',
      kind: 'field',
      fieldKey: 'company.phone',
      x: 50,
      y: 92,
      fontSize: 10,
      color: '#595959',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'doc-title',
      kind: 'field',
      fieldKey: 'document.title',
      x: 50,
      y: 116,
      fontSize: 14,
      fontWeight: 'bold',
      color: '#4d4d4d',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'doc-number',
      kind: 'field',
      fieldKey: 'document.number',
      x: 362,
      y: 50,
      width: 200,
      fontSize: 10,
      color: '#666666',
      align: 'right',
      visible: true,
      layout: 'absolute',
    },
    {
      id: 'doc-date',
      kind: 'field',
      fieldKey: 'document.date',
      x: 362,
      y: 66,
      width: 200,
      fontSize: 10,
      color: '#666666',
      align: 'right',
      visible: true,
      layout: 'absolute',
    },
    {
      id: 'bill-to-label',
      kind: 'field',
      fieldKey: 'bill_to.label',
      label: 'Bill To',
      x: 50,
      y: 150,
      fontSize: 11,
      fontWeight: 'bold',
      color: '#666666',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'client-name',
      kind: 'field',
      fieldKey: 'client.name',
      x: 50,
      y: 168,
      fontSize: 12,
      fontWeight: 'bold',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'client-contact',
      kind: 'field',
      fieldKey: 'client.contact_name',
      x: 50,
      y: 184,
      fontSize: 10,
      visible: true,
      layout: 'flow',
    },
    {
      id: 'client-address',
      kind: 'field',
      fieldKey: 'client.address',
      x: 50,
      y: 200,
      fontSize: 10,
      visible: true,
      layout: 'flow',
    },
    {
      id: 'client-email',
      kind: 'field',
      fieldKey: 'client.email',
      x: 50,
      y: 216,
      fontSize: 10,
      visible: true,
      layout: 'flow',
    },
    {
      id: 'client-phone',
      kind: 'field',
      fieldKey: 'client.phone',
      x: 50,
      y: 232,
      fontSize: 10,
      visible: true,
      layout: 'flow',
    },
    {
      id: 'job-title',
      kind: 'field',
      fieldKey: 'job.title',
      x: 50,
      y: 270,
      fontSize: 16,
      fontWeight: 'bold',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'job-visit',
      kind: 'field',
      fieldKey: 'job.visit_date',
      x: 50,
      y: 292,
      fontSize: 10,
      color: '#595959',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'line-items',
      kind: 'table',
      fieldKey: 'table.line_items',
      x: 50,
      y: 330,
      width: 512,
      visible: true,
      locked: true,
      layout: 'flow',
    },
    {
      id: 'payments',
      kind: 'field',
      fieldKey: 'payments.section',
      x: 50,
      y: 500,
      visible: true,
      layout: 'flow',
    },
    {
      id: 'totals',
      kind: 'field',
      fieldKey: 'summary.totals',
      x: 50,
      y: 580,
      visible: true,
      layout: 'flow',
    },
    {
      id: 'footer',
      kind: 'field',
      fieldKey: 'footer.text',
      x: 50,
      y: 660,
      fontSize: 9,
      color: '#808080',
      visible: true,
      layout: 'flow',
    },
  ],
}

export const DEFAULT_ESTIMATE_DOCUMENT_TEMPLATE: DocumentTemplate = {
  version: 2,
  page: { ...DOCUMENT_PAGE },
  footerDueText: 'Thank you for your business.',
  footerPaidText: 'Thank you for your business.',
  brandColors: { ...DEFAULT_BRAND_COLORS },
  tableColumns: { ...DEFAULT_TABLE_COLUMNS },
  preset: 'classic',
  elements: [
    { ...COMPANY_LOGO_ELEMENT },
    {
      id: 'company-name',
      kind: 'field',
      fieldKey: 'company.name',
      x: 50,
      y: 50,
      fontSize: 20,
      fontWeight: 'bold',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'company-address',
      kind: 'field',
      fieldKey: 'company.address',
      x: 50,
      y: 76,
      fontSize: 10,
      color: '#595959',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'company-phone',
      kind: 'field',
      fieldKey: 'company.phone',
      x: 50,
      y: 92,
      fontSize: 10,
      color: '#595959',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'doc-title',
      kind: 'field',
      fieldKey: 'document.title',
      x: 50,
      y: 116,
      fontSize: 14,
      fontWeight: 'bold',
      color: '#4d4d4d',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'doc-number',
      kind: 'field',
      fieldKey: 'document.number',
      x: 362,
      y: 50,
      width: 200,
      fontSize: 10,
      color: '#666666',
      align: 'right',
      visible: true,
      layout: 'absolute',
    },
    {
      id: 'doc-date',
      kind: 'field',
      fieldKey: 'document.date',
      x: 362,
      y: 66,
      width: 200,
      fontSize: 10,
      color: '#666666',
      align: 'right',
      visible: true,
      layout: 'absolute',
    },
    {
      id: 'bill-to-label',
      kind: 'field',
      fieldKey: 'bill_to.label',
      label: 'Bill To',
      x: 50,
      y: 150,
      fontSize: 11,
      fontWeight: 'bold',
      color: '#666666',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'client-name',
      kind: 'field',
      fieldKey: 'client.name',
      x: 50,
      y: 168,
      fontSize: 12,
      fontWeight: 'bold',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'client-contact',
      kind: 'field',
      fieldKey: 'client.contact_name',
      x: 50,
      y: 184,
      fontSize: 10,
      visible: true,
      layout: 'flow',
    },
    {
      id: 'client-address',
      kind: 'field',
      fieldKey: 'client.address',
      x: 50,
      y: 200,
      fontSize: 10,
      visible: true,
      layout: 'flow',
    },
    {
      id: 'client-email',
      kind: 'field',
      fieldKey: 'client.email',
      x: 50,
      y: 216,
      fontSize: 10,
      visible: true,
      layout: 'flow',
    },
    {
      id: 'client-phone',
      kind: 'field',
      fieldKey: 'client.phone',
      x: 50,
      y: 232,
      fontSize: 10,
      visible: true,
      layout: 'flow',
    },
    {
      id: 'estimate-title',
      kind: 'field',
      fieldKey: 'estimate.title',
      x: 50,
      y: 270,
      fontSize: 16,
      fontWeight: 'bold',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'estimate-description',
      kind: 'field',
      fieldKey: 'estimate.description',
      x: 50,
      y: 292,
      fontSize: 10,
      color: '#595959',
      visible: true,
      layout: 'flow',
    },
    {
      id: 'line-items',
      kind: 'table',
      fieldKey: 'table.line_items',
      x: 50,
      y: 330,
      width: 512,
      visible: true,
      locked: true,
      layout: 'flow',
    },
    {
      id: 'totals',
      kind: 'field',
      fieldKey: 'summary.total',
      x: 50,
      y: 580,
      visible: true,
      layout: 'flow',
    },
    {
      id: 'footer',
      kind: 'field',
      fieldKey: 'footer.text',
      x: 50,
      y: 660,
      fontSize: 9,
      color: '#808080',
      visible: true,
      layout: 'flow',
    },
  ],
}

const BLOCK_ELEMENT_IDS: Record<InvoiceTemplateBlockType, string[]> = {
  company_header: ['company-logo', 'company-name', 'company-address', 'company-phone', 'doc-title'],
  invoice_meta: ['doc-number', 'doc-date'],
  bill_to: [
    'bill-to-label',
    'client-name',
    'client-contact',
    'client-address',
    'client-email',
    'client-phone',
  ],
  job_details: ['job-title', 'job-visit'],
  line_items: ['line-items'],
  payments: ['payments'],
  totals: ['totals'],
  footer: ['footer'],
}

const BLOCK_TYPE_ORDER: InvoiceTemplateBlockType[] = [
  'company_header',
  'invoice_meta',
  'bill_to',
  'job_details',
  'line_items',
  'payments',
  'totals',
  'footer',
]

const ELEMENT_BLOCK_TYPE: Record<string, InvoiceTemplateBlockType> = {}
for (const [blockType, ids] of Object.entries(BLOCK_ELEMENT_IDS)) {
  for (const id of ids) {
    ELEMENT_BLOCK_TYPE[id] = blockType as InvoiceTemplateBlockType
  }
}

function cloneTemplate(template: DocumentTemplate): DocumentTemplate {
  return JSON.parse(JSON.stringify(template)) as DocumentTemplate
}

function normalizeBrandColors(input: unknown): DocumentBrandColors {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_BRAND_COLORS }
  }

  const raw = input as Partial<DocumentBrandColors>
  return {
    primary:
      typeof raw.primary === 'string' && raw.primary.trim()
        ? raw.primary.trim()
        : DEFAULT_BRAND_COLORS.primary,
    accent:
      typeof raw.accent === 'string' && raw.accent.trim()
        ? raw.accent.trim()
        : DEFAULT_BRAND_COLORS.accent,
    muted:
      typeof raw.muted === 'string' && raw.muted.trim()
        ? raw.muted.trim()
        : DEFAULT_BRAND_COLORS.muted,
    border:
      typeof raw.border === 'string' && raw.border.trim()
        ? raw.border.trim()
        : DEFAULT_BRAND_COLORS.border,
  }
}

function normalizeTableColumns(input: unknown): DocumentTableColumns {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_TABLE_COLUMNS }
  }

  const raw = input as Partial<DocumentTableColumns>
  const qty = typeof raw.qty === 'number' ? raw.qty : DEFAULT_TABLE_COLUMNS.qty
  const unit = typeof raw.unit === 'number' ? raw.unit : DEFAULT_TABLE_COLUMNS.unit
  const amount = typeof raw.amount === 'number' ? raw.amount : DEFAULT_TABLE_COLUMNS.amount

  return {
    qty: Math.min(Math.max(120, qty), unit - 40),
    unit: Math.min(Math.max(qty + 40, unit), amount - 40),
    amount: Math.max(unit + 40, amount),
  }
}

function normalizeElement(input: unknown, fallback?: DocumentElement): DocumentElement | null {
  if (!input || typeof input !== 'object') return fallback ?? null
  const raw = input as Partial<DocumentElement>
  if (!raw.id || !raw.kind) return fallback ?? null

  return {
    id: String(raw.id),
    kind: raw.kind,
    x: typeof raw.x === 'number' ? raw.x : (fallback?.x ?? 50),
    y: typeof raw.y === 'number' ? raw.y : (fallback?.y ?? 50),
    width: typeof raw.width === 'number' ? raw.width : fallback?.width,
    height: typeof raw.height === 'number' ? raw.height : fallback?.height,
    visible: raw.visible !== false,
    locked: raw.locked === true,
    layout: raw.layout === 'absolute' ? 'absolute' : 'flow',
    fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : fallback?.fontSize,
    fontWeight: raw.fontWeight === 'bold' ? 'bold' : 'normal',
    color: typeof raw.color === 'string' ? raw.color : fallback?.color,
    align:
      raw.align === 'center' || raw.align === 'right' ? raw.align : (fallback?.align ?? 'left'),
    fieldKey: typeof raw.fieldKey === 'string' ? raw.fieldKey : fallback?.fieldKey,
    label: typeof raw.label === 'string' ? raw.label : fallback?.label,
    text: typeof raw.text === 'string' ? raw.text : fallback?.text,
    format:
      raw.format === 'currency' || raw.format === 'date' ? raw.format : fallback?.format,
  }
}

export function normalizeDocumentTemplate(
  input: unknown,
  kind: DocumentKind
): DocumentTemplate {
  const defaults =
    kind === 'invoice' ? DEFAULT_INVOICE_DOCUMENT_TEMPLATE : DEFAULT_ESTIMATE_DOCUMENT_TEMPLATE

  if (!input || typeof input !== 'object') {
    return cloneTemplate(defaults)
  }

  const raw = input as Partial<DocumentTemplate>
  if (raw.version !== 2 || !Array.isArray(raw.elements)) {
    return cloneTemplate(defaults)
  }

  const fallbackById = new Map(defaults.elements.map((element) => [element.id, element]))
  const normalizedElements: DocumentElement[] = []
  const seenIds = new Set<string>()

  for (const element of raw.elements) {
    const fallback = fallbackById.get(String((element as DocumentElement)?.id))
    const normalized = normalizeElement(element, fallback)
    if (!normalized || seenIds.has(normalized.id)) continue
    seenIds.add(normalized.id)
    normalizedElements.push(normalized)
  }

  for (const fallbackElement of defaults.elements) {
    if (!seenIds.has(fallbackElement.id)) {
      normalizedElements.push({ ...fallbackElement })
    }
  }

  const normalized: DocumentTemplate = {
    version: 2,
    page: {
      width:
        typeof raw.page?.width === 'number' ? raw.page.width : defaults.page.width,
      height:
        typeof raw.page?.height === 'number' ? raw.page.height : defaults.page.height,
    },
    elements: normalizedElements,
    showPayments: kind === 'invoice' ? raw.showPayments !== false : undefined,
    footerDueText:
      typeof raw.footerDueText === 'string' && raw.footerDueText.trim()
        ? raw.footerDueText.trim()
        : defaults.footerDueText,
    footerPaidText:
      typeof raw.footerPaidText === 'string' && raw.footerPaidText.trim()
        ? raw.footerPaidText.trim()
        : defaults.footerPaidText,
    brandColors: normalizeBrandColors(raw.brandColors ?? defaults.brandColors),
    tableColumns: normalizeTableColumns(raw.tableColumns ?? defaults.tableColumns),
    preset:
      raw.preset === 'classic' || raw.preset === 'compact' || raw.preset === 'custom'
        ? raw.preset
        : defaults.preset,
  }

  return repairDocumentTemplatePositions(normalized, kind)
}

export function documentTemplateNeedsPositionRepair(template: DocumentTemplate): boolean {
  const stackCounts = new Map<string, number>()
  for (const element of template.elements.filter((item) => item.visible)) {
    const key = `${element.x}:${element.y}`
    stackCounts.set(key, (stackCounts.get(key) || 0) + 1)
  }
  return Math.max(0, ...stackCounts.values()) >= 4
}

function repairDocumentTemplatePositions(
  template: DocumentTemplate,
  kind: DocumentKind
): DocumentTemplate {
  const defaults =
    kind === 'invoice' ? DEFAULT_INVOICE_DOCUMENT_TEMPLATE : DEFAULT_ESTIMATE_DOCUMENT_TEMPLATE
  const defaultById = new Map(defaults.elements.map((element) => [element.id, element]))

  const stackCounts = new Map<string, number>()
  for (const element of template.elements.filter((item) => item.visible)) {
    const key = `${element.x}:${element.y}`
    stackCounts.set(key, (stackCounts.get(key) || 0) + 1)
  }

  const maxStack = Math.max(0, ...stackCounts.values())
  if (maxStack < 4) return template

  return {
    ...template,
    elements: template.elements.map((element) => {
      const fallback = defaultById.get(element.id)
      if (!fallback) return element
      return {
        ...element,
        x: fallback.x,
        y: fallback.y,
        width: fallback.width,
        layout: fallback.layout,
      }
    }),
  }
}

export function normalizeCompanyDocumentTemplates(input: unknown): CompanyDocumentTemplates {
  if (!input || typeof input !== 'object') {
    return {
      invoice: cloneTemplate(DEFAULT_INVOICE_DOCUMENT_TEMPLATE),
      estimate: cloneTemplate(DEFAULT_ESTIMATE_DOCUMENT_TEMPLATE),
    }
  }

  const raw = input as Partial<CompanyDocumentTemplates>
  return {
    invoice: normalizeDocumentTemplate(raw.invoice, 'invoice'),
    estimate: normalizeDocumentTemplate(raw.estimate, 'estimate'),
  }
}

export function migrateInvoiceTemplateToDocumentTemplate(
  invoiceTemplate: InvoiceTemplate
): DocumentTemplate {
  const template = cloneTemplate(DEFAULT_INVOICE_DOCUMENT_TEMPLATE)
  template.footerDueText = invoiceTemplate.footerText
  template.showPayments = invoiceTemplate.showPayments

  for (const element of template.elements) {
    element.visible = false
  }

  for (const block of invoiceTemplate.blocks) {
    if (!block.enabled) continue
    if (block.type === 'payments' && !invoiceTemplate.showPayments) continue

    for (const id of BLOCK_ELEMENT_IDS[block.type]) {
      const element = template.elements.find((item) => item.id === id)
      if (!element) continue
      element.visible = true
      if (block.type === 'bill_to' && id === 'bill-to-label' && block.label?.trim()) {
        element.label = block.label.trim()
      }
    }
  }

  return template
}

export function documentTemplateToInvoiceTemplate(template: DocumentTemplate): InvoiceTemplate {
  const flowElements = template.elements
    .filter((element) => element.layout !== 'absolute')
    .sort((a, b) => a.y - b.y)

  const blockOrder: InvoiceTemplateBlockType[] = []
  for (const element of flowElements) {
    const blockType = ELEMENT_BLOCK_TYPE[element.id]
    if (!blockType || blockOrder.includes(blockType)) continue
    blockOrder.push(blockType)
  }

  for (const blockType of BLOCK_TYPE_ORDER) {
    if (!blockOrder.includes(blockType)) {
      const absoluteIds = BLOCK_ELEMENT_IDS[blockType]
      const hasVisibleAbsolute = template.elements.some(
        (element) => absoluteIds.includes(element.id) && element.visible
      )
      if (hasVisibleAbsolute) {
        const metaIndex = blockOrder.indexOf('company_header')
        if (blockType === 'invoice_meta' && metaIndex >= 0) {
          blockOrder.splice(metaIndex + 1, 0, blockType)
        } else if (blockType === 'invoice_meta') {
          blockOrder.unshift(blockType)
        }
      }
    }
  }

  const sortedBlockTypes = [
    ...BLOCK_TYPE_ORDER.filter((blockType) => blockOrder.includes(blockType)),
    ...blockOrder.filter((blockType) => !BLOCK_TYPE_ORDER.includes(blockType)),
  ]

  const blocks = sortedBlockTypes.map((blockType) => {
    const ids = BLOCK_ELEMENT_IDS[blockType]
    const enabled = template.elements.some(
      (element) => ids.includes(element.id) && element.visible
    )
    const billToLabel = template.elements.find((element) => element.id === 'bill-to-label')

    return {
      id: blockType,
      type: blockType,
      enabled:
        blockType === 'payments'
          ? enabled && template.showPayments !== false
          : enabled,
      label: blockType === 'bill_to' ? billToLabel?.label : undefined,
    }
  })

  return {
    blocks,
    footerText: template.footerDueText || DEFAULT_INVOICE_TEMPLATE.footerText,
    showPayments: template.showPayments !== false,
  }
}

export function resolveCompanyDocumentTemplates(
  documentTemplates: unknown,
  legacyInvoiceTemplate: unknown
): CompanyDocumentTemplates {
  if (documentTemplates && typeof documentTemplates === 'object') {
    const raw = documentTemplates as Partial<CompanyDocumentTemplates>
    if (raw.invoice?.version === 2 || raw.estimate?.version === 2) {
      return normalizeCompanyDocumentTemplates(documentTemplates)
    }
  }

  const legacyInvoice = normalizeInvoiceTemplate(legacyInvoiceTemplate)

  return {
    invoice: migrateInvoiceTemplateToDocumentTemplate(legacyInvoice),
    estimate: cloneTemplate(DEFAULT_ESTIMATE_DOCUMENT_TEMPLATE),
  }
}

export function getVisibleDocumentElements(template: DocumentTemplate) {
  return template.elements.filter((element) => element.visible)
}