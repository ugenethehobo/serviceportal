import type {
  DocumentElement,
  DocumentKind,
  DocumentTableColumns,
  DocumentTemplate,
} from '@/lib/document-template'
import { DEFAULT_TABLE_COLUMNS, DOCUMENT_PAGE } from '@/lib/document-template'
import { DOCUMENT_FIELD_DEFINITIONS } from '@/lib/document-template-fields'

export const PREVIEW_DISPLAY_WIDTH = 560

export function getPreviewScale(
  template: DocumentTemplate,
  displayWidth: number = PREVIEW_DISPLAY_WIDTH
) {
  const pageWidth = template.page.width || DOCUMENT_PAGE.width
  const width = Math.max(240, Math.min(displayWidth, PREVIEW_DISPLAY_WIDTH))
  return width / pageWidth
}

export function getPreviewDisplayHeight(
  template: DocumentTemplate,
  displayWidth: number = PREVIEW_DISPLAY_WIDTH
) {
  const pageHeight = template.page.height || DOCUMENT_PAGE.height
  return pageHeight * getPreviewScale(template, displayWidth)
}

export function getPreviewFitDimensions(
  template: DocumentTemplate,
  availableWidth: number,
  availableHeight: number,
  maxDisplayWidth: number = PREVIEW_DISPLAY_WIDTH
) {
  const pageWidth = template.page.width || DOCUMENT_PAGE.width
  const pageHeight = template.page.height || DOCUMENT_PAGE.height
  const widthBudget = Math.max(200, Math.min(maxDisplayWidth, availableWidth))
  const heightBudget = Math.max(200, availableHeight)
  const scale = Math.min(widthBudget / pageWidth, heightBudget / pageHeight)

  return {
    displayWidth: pageWidth * scale,
    displayHeight: pageHeight * scale,
    scale,
  }
}

export function isInteractiveDocumentElement(element: DocumentElement): boolean {
  return element.kind === 'signature' || element.kind === 'initial' || element.kind === 'input'
}

export function getElementLabel(element: DocumentElement): string {
  if (element.kind === 'text') {
    return element.text?.trim() || 'Custom text'
  }

  if (element.kind === 'signature') {
    return element.label?.trim() || 'Signature field'
  }

  if (element.kind === 'initial') {
    return element.label?.trim() || 'Initials field'
  }

  if (element.kind === 'input') {
    return element.label?.trim() || 'Text input field'
  }

  if (element.fieldKey) {
    const definition = DOCUMENT_FIELD_DEFINITIONS.find((field) => field.key === element.fieldKey)
    if (definition) return definition.label
  }

  return element.id
}

export function isElementValidForKind(element: DocumentElement, kind: DocumentKind): boolean {
  if (element.kind === 'signature' || element.kind === 'initial' || element.kind === 'input') {
    return kind === 'contract'
  }

  if (!element.fieldKey) return true

  const definition = DOCUMENT_FIELD_DEFINITIONS.find((field) => field.key === element.fieldKey)
  if (!definition) return true

  return definition.kinds.includes(kind)
}

export function getElementGroup(element: DocumentElement, kind: DocumentKind): string {
  if (element.kind === 'signature' || element.kind === 'initial' || element.kind === 'input') {
    return 'Signing'
  }

  if (element.fieldKey) {
    const definition = DOCUMENT_FIELD_DEFINITIONS.find((field) => field.key === element.fieldKey)
    if (definition && definition.kinds.includes(kind)) {
      return definition.group
    }
    if (element.fieldKey.startsWith('input.')) {
      return 'Inputs'
    }
  }
  return 'Other'
}

export function getElementBounds(element: DocumentElement): { width: number; height: number } {
  if (element.width && element.height) {
    return { width: element.width, height: element.height }
  }

  if (element.kind === 'table') {
    return { width: element.width || 512, height: element.height || 140 }
  }

  if (element.kind === 'line') {
    return { width: element.width || 512, height: 12 }
  }

  const fontSize = element.fontSize || 10

  switch (element.fieldKey) {
    case 'company.logo':
      return { width: element.width || 110, height: element.height || 52 }
    case 'company.name':
      return { width: 280, height: 28 }
    case 'document.title':
      return { width: 160, height: 22 }
    case 'document.number':
    case 'document.date':
      return { width: element.width || 200, height: 18 }
    case 'table.line_items':
      return { width: 512, height: 140 }
    case 'summary.totals':
    case 'summary.total':
      return { width: 420, height: 56 }
    case 'payments.section':
      return { width: 420, height: 72 }
    case 'estimate.description':
      return { width: 420, height: 48 }
    case 'footer.text':
      return { width: 420, height: 32 }
    case 'sign.client':
      return { width: element.width || 260, height: element.height || 72 }
    case 'sign.client.initials':
      return { width: element.width || 120, height: element.height || 48 }
    default:
      if (element.kind === 'signature') {
        return { width: element.width || 260, height: element.height || 72 }
      }
      if (element.kind === 'initial') {
        return { width: element.width || 120, height: element.height || 48 }
      }
      if (element.kind === 'input') {
        return { width: element.width || 260, height: element.height || 48 }
      }
      return { width: element.width || 220, height: Math.max(20, fontSize + 10) }
  }
}

export function getElementOverlayRect(element: DocumentElement) {
  const bounds = getElementBounds(element)
  return {
    x: element.x,
    y: element.y,
    width: bounds.width,
    height: bounds.height,
  }
}

export function clampElementPosition(
  element: DocumentElement,
  x: number,
  y: number,
  template: DocumentTemplate
) {
  const { width, height } = getElementBounds(element)
  const pageWidth = template.page.width || DOCUMENT_PAGE.width
  const pageHeight = template.page.height || DOCUMENT_PAGE.height
  const maxX = Math.max(0, pageWidth - width)
  const maxY = Math.max(0, pageHeight - height)

  return {
    x: Math.round(Math.min(Math.max(0, x), maxX)),
    y: Math.round(Math.min(Math.max(0, y), maxY)),
  }
}

export function groupElementsForKind(template: DocumentTemplate, kind: DocumentKind) {
  const groups = new Map<string, DocumentElement[]>()

  for (const element of template.elements) {
    if (!isElementValidForKind(element, kind)) continue

    const group = getElementGroup(element, kind)
    const current = groups.get(group) || []
    current.push(element)
    groups.set(group, current)
  }

  const order = [
    'Company',
    'Document',
    'Client',
    'Service',
    'Job',
    'Estimate',
    'Contract',
    'Signing',
    'Inputs',
    'Line items',
    'Totals',
    'Footer',
    'Other',
  ]
  return order
    .filter((group) => groups.has(group))
    .map((group) => ({
      group,
      elements: (groups.get(group) || []).sort((a, b) => a.y - b.y),
    }))
}

export function updateTemplateElement(
  template: DocumentTemplate,
  elementId: string,
  patch: Partial<DocumentElement>
): DocumentTemplate {
  return {
    ...template,
    elements: template.elements.map((element) =>
      element.id === elementId ? { ...element, ...patch } : element
    ),
  }
}

export function isResizableElement(element: DocumentElement): boolean {
  return (
    element.kind === 'image' ||
    element.kind === 'table' ||
    element.kind === 'signature' ||
    element.kind === 'initial' ||
    element.kind === 'input'
  )
}

export function getTableColumnOffsets(template: DocumentTemplate): DocumentTableColumns {
  return template.tableColumns || DEFAULT_TABLE_COLUMNS
}

export function getTableColumnPositions(template: DocumentTemplate, tableElement: DocumentElement) {
  const columns = getTableColumnOffsets(template)
  const baseX = tableElement.x
  return {
    desc: baseX,
    qty: baseX + columns.qty,
    unit: baseX + columns.unit,
    amount: baseX + columns.amount,
  }
}

export function clampTableColumns(
  columns: DocumentTableColumns,
  tableWidth: number
): DocumentTableColumns {
  const minQty = 120
  const maxAmount = Math.max(tableWidth - 50, minQty + 120)
  const qty = Math.min(Math.max(minQty, columns.qty), columns.unit - 40)
  const unit = Math.min(Math.max(qty + 40, columns.unit), columns.amount - 40)
  const amount = Math.min(Math.max(unit + 40, columns.amount), maxAmount)

  return { qty, unit, amount }
}

export function clampElementSize(
  element: DocumentElement,
  width: number,
  height: number,
  template: DocumentTemplate
) {
  const pageWidth = template.page.width || DOCUMENT_PAGE.width
  const pageHeight = template.page.height || DOCUMENT_PAGE.height
  const isInteractive = isInteractiveDocumentElement(element)
  const minWidth = element.kind === 'image' ? 40 : isInteractive ? 80 : 240
  const minHeight =
    element.kind === 'image' ? 24 : isInteractive ? 28 : element.kind === 'table' ? 80 : 80
  const maxWidth = pageWidth - element.x
  const maxHeight =
    element.kind === 'image' || isInteractive
      ? pageHeight - element.y
      : element.height || 200

  return {
    width: Math.round(Math.min(Math.max(minWidth, width), maxWidth)),
    height: Math.round(Math.min(Math.max(minHeight, height), maxHeight)),
  }
}