import type { DocumentElement, DocumentKind, DocumentTemplate } from '@/lib/document-template'
import {
  DEFAULT_CONTRACT_DOCUMENT_TEMPLATE,
  DEFAULT_ESTIMATE_DOCUMENT_TEMPLATE,
  DEFAULT_INVOICE_DOCUMENT_TEMPLATE,
  normalizeDocumentTemplate,
  type DocumentTemplatePreset,
} from '@/lib/document-template'

export type TemplateLayoutPreset = Exclude<DocumentTemplatePreset, 'custom'>

const LAYOUT_COPY_KEYS: (keyof DocumentElement)[] = [
  'x',
  'y',
  'width',
  'height',
  'visible',
  'layout',
  'fontSize',
  'fontWeight',
  'color',
  'align',
]

const INVOICE_TO_ESTIMATE_LAYOUT_MAP: Record<string, string> = {
  'job-title': 'estimate-title',
  'job-visit': 'estimate-description',
}

function cloneTemplate(template: DocumentTemplate): DocumentTemplate {
  return JSON.parse(JSON.stringify(template)) as DocumentTemplate
}

function copyElementLayout(source: DocumentElement, target: DocumentElement): DocumentElement {
  const next: DocumentElement = { ...target }

  for (const key of LAYOUT_COPY_KEYS) {
    const value = source[key]
    if (value !== undefined) {
      ;(next as Record<string, unknown>)[key] = value
    }
  }

  if (target.id === 'bill-to-label' && source.label?.trim()) {
    next.label = source.label.trim()
  }

  return next
}

function buildCompactTemplate(template: DocumentTemplate): DocumentTemplate {
  return {
    ...template,
    preset: 'compact',
    elements: template.elements.map((element) => {
      const next: DocumentElement = {
        ...element,
        y: Math.max(40, Math.round(element.y * 0.88)),
        fontSize:
          typeof element.fontSize === 'number'
            ? Math.max(8, element.fontSize - 1)
            : element.fontSize,
      }

      if (element.id === 'company-logo') {
        next.visible = true
        next.x = 452
        next.y = 36
        next.width = 100
        next.height = 48
      }

      if (element.id === 'line-items') {
        next.y = Math.max(280, Math.round(element.y * 0.9))
      }

      if (element.id === 'totals' || element.id === 'footer') {
        next.y = Math.max(element.y - 48, 500)
      }

      return next
    }),
  }
}

function getBaseTemplateForKind(kind: DocumentKind) {
  if (kind === 'invoice') return DEFAULT_INVOICE_DOCUMENT_TEMPLATE
  if (kind === 'contract') return DEFAULT_CONTRACT_DOCUMENT_TEMPLATE
  return DEFAULT_ESTIMATE_DOCUMENT_TEMPLATE
}

export function getDefaultDocumentTemplate(kind: DocumentKind): DocumentTemplate {
  return normalizeDocumentTemplate(cloneTemplate(getBaseTemplateForKind(kind)), kind)
}

export function getCompactDocumentTemplate(kind: DocumentKind): DocumentTemplate {
  if (kind === 'contract') {
    return getDefaultDocumentTemplate(kind)
  }
  return normalizeDocumentTemplate(
    buildCompactTemplate(cloneTemplate(getBaseTemplateForKind(kind))),
    kind
  )
}

export function resetToDefaultTemplate(kind: DocumentKind): DocumentTemplate {
  return getDefaultDocumentTemplate(kind)
}

export function applyTemplateLayoutPreset(
  current: DocumentTemplate,
  preset: TemplateLayoutPreset,
  kind: DocumentKind
): DocumentTemplate {
  const base =
    preset === 'compact' ? getCompactDocumentTemplate(kind) : getDefaultDocumentTemplate(kind)

  const mergedElements = base.elements.map((element) => {
    const existing = current.elements.find((item) => item.id === element.id)
    if (!existing) return element

    return {
      ...element,
      visible: existing.visible,
      label: existing.label ?? element.label,
    }
  })

  return normalizeDocumentTemplate(
    {
      ...base,
      showPayments: current.showPayments,
      footerDueText: current.footerDueText,
      footerPaidText: current.footerPaidText,
      brandColors: current.brandColors ?? base.brandColors,
      tableColumns: current.tableColumns ?? base.tableColumns,
      elements: mergedElements,
      preset,
    },
    kind
  )
}

export function applyInvoiceLayoutToEstimate(
  invoice: DocumentTemplate,
  estimate: DocumentTemplate
): DocumentTemplate {
  const invoiceById = new Map(invoice.elements.map((element) => [element.id, element]))

  const resolveInvoiceSourceId = (estimateElementId: string): string | null => {
    if (invoiceById.has(estimateElementId)) {
      return estimateElementId
    }

    for (const [invoiceId, estimateId] of Object.entries(INVOICE_TO_ESTIMATE_LAYOUT_MAP)) {
      if (estimateId === estimateElementId && invoiceById.has(invoiceId)) {
        return invoiceId
      }
    }

    return null
  }

  const nextElements = estimate.elements.map((element) => {
    const sourceId = resolveInvoiceSourceId(element.id)
    if (!sourceId) return element

    const source = invoiceById.get(sourceId)
    if (!source) return element

    return copyElementLayout(source, element)
  })

  return normalizeDocumentTemplate(
    {
      ...estimate,
      elements: nextElements,
    },
    'estimate'
  )
}