import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib'
import { formatCurrency } from '@/lib/billing'
import {
  DEFAULT_BRAND_COLORS,
  DEFAULT_TABLE_COLUMNS,
  DOCUMENT_PAGE,
  type DocumentKind,
  type DocumentElement,
  type DocumentTemplate,
} from '@/lib/document-template'

export type DocumentRenderData = {
  kind: DocumentKind
  template: DocumentTemplate
  company: {
    name: string
    address?: string | null
    phone?: string | null
    logoBytes?: Uint8Array | null
    /** @deprecated Use logoBytes — kept for backward compatibility. */
    logoUrl?: string | null
  }
  client: {
    name: string
    contact_name?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
  }
  document: {
    title: string
    number: string
    date: string
  }
  job?: {
    title: string
    visitDate: string | null
  }
  estimate?: {
    title: string
    description: string | null
  }
  contract?: {
    serviceName: string | null
    signedDate: string | null
  }
  fieldValues?: Record<string, string>
  signatures?: {
    client?: Uint8Array | null
    clientInitials?: Uint8Array | null
  }
  lineItems: Array<{
    description: string
    quantity: number
    unit_price: number
    amount: number
  }>
  payments?: Array<{
    payment_date: string
    method: string
    amount: number
  }>
  /** Payment plan schedule (non-default plans only). Ledger balance stays in summary.totals. */
  installments?: Array<{
    label: string
    amountDue: number
    amountPaid: number
    remaining: number
    statusLabel: string
    dueDate: string | null
  }>
  summary: {
    totalCharged?: number
    totalPaid?: number
    balanceDue?: number
    total?: number
  }
}

type FontSet = {
  regular: Awaited<ReturnType<PDFDocument['embedFont']>>
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
}

type RenderContext = {
  pdf: PDFDocument
  page: PDFPage
  fonts: FontSet
  data: DocumentRenderData
  signatureImages: {
    client: PDFImage | null
    clientInitials: PDFImage | null
  }
  pageWidth: number
  pageHeight: number
  margin: number
  logoImage: PDFImage | null
}

const MARGIN = 50
const FONT_ASCENDER_RATIO = 0.72
const TABLE_ROW_HEIGHT = 16
const TABLE_DESC_WRAP = 42
const FOOTER_RESERVE = 130

function textBaselineFromTop(topY: number, fontSize: number) {
  return topY + fontSize * FONT_ASCENDER_RATIO
}

export async function renderDocumentPdf(data: DocumentRenderData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const pageWidth = data.template.page.width || DOCUMENT_PAGE.width
  const pageHeight = data.template.page.height || DOCUMENT_PAGE.height

  const fonts: FontSet = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }

  const logoImage = await resolveLogoImage(pdf, data.company)
  const signatureImages = await resolveSignatureImages(pdf, data.signatures)

  const visibleElements = data.template.elements.filter((element) => element.visible)
  const tableElement = visibleElements.find((element) => element.fieldKey === 'table.line_items')
  const trailingFieldKeys = new Set([
    'payments.section',
    'installments.section',
    'summary.totals',
    'summary.total',
    'footer.text',
  ])

  const staticElements = visibleElements
    .filter(
      (element) =>
        element.fieldKey !== 'table.line_items' && !trailingFieldKeys.has(element.fieldKey || '')
    )
    .sort((a, b) => a.y - b.y)

  const trailingElements = visibleElements
    .filter((element) => trailingFieldKeys.has(element.fieldKey || ''))
    .sort((a, b) => a.y - b.y)

  let page = pdf.addPage([pageWidth, pageHeight])
  let ctx: RenderContext = {
    pdf,
    page,
    fonts,
    data,
    pageWidth,
    pageHeight,
    margin: MARGIN,
    logoImage,
    signatureImages,
  }

  for (const element of staticElements) {
    renderElement(ctx, element, element.y)
  }

  let contentEndY = tableElement?.y ?? MARGIN

  if (tableElement) {
    const tableResult = renderPaginatedLineItemsTable(ctx, tableElement)
    ctx = tableResult.ctx
    contentEndY = tableResult.endY
  }

  let trailingY = contentEndY + 20
  for (const element of trailingElements) {
    trailingY = Math.max(trailingY, element.y)
    trailingY = renderElement(ctx, element, trailingY)
    trailingY += 8
  }

  return pdf.save()
}

async function resolveSignatureImages(
  pdf: PDFDocument,
  signatures: DocumentRenderData['signatures']
): Promise<RenderContext['signatureImages']> {
  const { embedLogoInPdf } = await import('@/lib/document-template-logo-embed')

  const embed = async (bytes?: Uint8Array | null) => {
    if (!bytes?.length) return null
    try {
      return await embedLogoInPdf(pdf, bytes)
    } catch {
      return null
    }
  }

  return {
    client: await embed(signatures?.client),
    clientInitials: await embed(signatures?.clientInitials),
  }
}

async function resolveLogoImage(
  pdf: PDFDocument,
  company: DocumentRenderData['company']
): Promise<PDFImage | null> {
  const { embedLogoInPdf, loadLogoBytesFromUrl } = await import(
    '@/lib/document-template-logo-embed'
  )

  if (company.logoBytes?.length) {
    return embedLogoInPdf(pdf, company.logoBytes)
  }

  if (company.logoUrl) {
    const bytes = await loadLogoBytesFromUrl(company.logoUrl)
    if (bytes) {
      return embedLogoInPdf(pdf, bytes)
    }
  }

  return null
}

function addPage(ctx: RenderContext): RenderContext {
  const page = ctx.pdf.addPage([ctx.pageWidth, ctx.pageHeight])
  return { ...ctx, page }
}

function renderElement(ctx: RenderContext, element: DocumentElement, topY: number): number {
  switch (element.kind) {
    case 'image':
      return renderImageElement(ctx, element, topY)
    case 'table':
      return renderLineItemsTable(ctx, element, topY, ctx.data.lineItems)
    case 'line':
      return renderLine(ctx, element, topY)
    case 'text':
      return renderStaticText(ctx, element, topY)
    case 'signature':
      return renderSignatureField(ctx, element, topY, 'signature')
    case 'initial':
      return renderSignatureField(ctx, element, topY, 'initial')
    case 'input':
      return renderInputField(ctx, element, topY)
    case 'field':
    default:
      return renderField(ctx, element, topY)
  }
}

function renderImageElement(ctx: RenderContext, element: DocumentElement, topY: number): number {
  if (element.fieldKey !== 'company.logo' || !ctx.logoImage) return topY

  const width = element.width || 110
  const height = element.height || 52
  const image = ctx.logoImage
  const scale = Math.min(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  const offsetX = element.x + (width - drawWidth) / 2
  const offsetY = topY + (height - drawHeight) / 2

  ctx.page.drawImage(image, {
    x: offsetX,
    y: pdfY(ctx, offsetY + drawHeight),
    width: drawWidth,
    height: drawHeight,
  })

  return topY + height
}

function renderField(ctx: RenderContext, element: DocumentElement, topY: number): number {
  const fieldKey = element.fieldKey || ''

  switch (fieldKey) {
    case 'company.name':
      return drawTextBlock(ctx, element, topY, ctx.data.company.name, 'primary')
    case 'company.address':
      return drawOptionalText(ctx, element, topY, ctx.data.company.address, 'muted')
    case 'company.phone':
      return drawOptionalText(ctx, element, topY, ctx.data.company.phone, 'muted')
    case 'document.title':
      return drawTextBlock(ctx, element, topY, ctx.data.document.title)
    case 'document.number':
      return drawTextBlock(
        ctx,
        element,
        topY,
        `${ctx.data.kind === 'invoice' ? 'Invoice' : ctx.data.kind === 'contract' ? 'Contract' : 'Estimate'} #: ${ctx.data.document.number}`,
        'muted'
      )
    case 'document.date':
      return drawTextBlock(ctx, element, topY, `Date: ${ctx.data.document.date}`, 'muted')
    case 'bill_to.label':
      return drawTextBlock(ctx, element, topY, element.label?.trim() || 'Bill To', 'muted')
    case 'client.name':
      return drawTextBlock(ctx, element, topY, ctx.data.client.name, 'primary')
    case 'client.contact_name':
      return drawOptionalText(ctx, element, topY, ctx.data.client.contact_name)
    case 'client.address':
      return drawOptionalText(ctx, element, topY, ctx.data.client.address)
    case 'client.email':
      return drawOptionalText(ctx, element, topY, ctx.data.client.email)
    case 'client.phone':
      return drawOptionalText(ctx, element, topY, ctx.data.client.phone)
    case 'job.title':
      return drawOptionalText(ctx, element, topY, ctx.data.job?.title, 'primary')
    case 'job.visit_date':
      return drawOptionalText(
        ctx,
        element,
        topY,
        ctx.data.job?.visitDate ? `Visit: ${ctx.data.job.visitDate}` : null,
        'muted'
      )
    case 'estimate.title':
      return drawOptionalText(ctx, element, topY, ctx.data.estimate?.title, 'primary')
    case 'estimate.description':
      return drawWrappedOptionalText(
        ctx,
        element,
        topY,
        ctx.data.estimate?.description,
        80,
        'muted'
      )
    case 'payments.section':
      return renderPaymentsSection(ctx, element, topY)
    case 'installments.section':
      return renderInstallmentsSection(ctx, element, topY)
    case 'summary.totals':
      return renderInvoiceTotals(ctx, element, topY)
    case 'summary.total':
      return renderEstimateTotal(ctx, element, topY)
    case 'footer.text':
      return renderFooter(ctx, element, topY)
    case 'service.name':
      return drawOptionalText(
        ctx,
        element,
        topY,
        ctx.data.contract?.serviceName,
        'primary'
      )
    case 'contract.signed_date':
      return drawOptionalText(
        ctx,
        element,
        topY,
        ctx.data.contract?.signedDate
          ? `Signed: ${ctx.data.contract.signedDate}`
          : 'Signed: _____________',
        'muted'
      )
    case 'sign.client':
      return renderSignatureField(ctx, element, topY, 'signature')
    case 'sign.client.initials':
      return renderSignatureField(ctx, element, topY, 'initial')
    default:
      if (fieldKey.startsWith('input.')) {
        return renderInputField(ctx, element, topY)
      }
      return topY
  }
}

function renderInputField(ctx: RenderContext, element: DocumentElement, topY: number): number {
  const width = element.width || 260
  const height = element.height || 48
  const label = element.label?.trim() || 'Response'
  const fieldKey = element.fieldKey || element.id
  const value = ctx.data.fieldValues?.[fieldKey]?.trim() || ''

  if (!value) {
    const borderColor = resolveBrandColor(ctx.data.template, 'border')
    ctx.page.drawRectangle({
      x: element.x,
      y: pdfY(ctx, topY + height),
      width,
      height,
      borderColor,
      borderWidth: 1,
    })
  }

  drawTextBlock(ctx, { ...element, fontSize: element.fontSize || 9 }, topY + 4, label, 'muted')

  if (value) {
    drawWrappedOptionalText(ctx, element, topY + 18, value, Math.floor(width / 6), 'primary')
  } else {
    drawTextBlock(
      ctx,
      { ...element, fontSize: element.fontSize || 10, color: '#9ca3af' },
      topY + 22,
      'Client fills in when signing',
      'muted'
    )
  }

  return topY + height + 8
}

function renderSignatureField(
  ctx: RenderContext,
  element: DocumentElement,
  topY: number,
  variant: 'signature' | 'initial'
): number {
  const width = element.width || (variant === 'signature' ? 260 : 120)
  const height = element.height || (variant === 'signature' ? 72 : 48)
  const label =
    element.label?.trim() || (variant === 'signature' ? 'Client signature' : 'Client initials')
  const image =
    variant === 'signature'
      ? ctx.signatureImages.client
      : ctx.signatureImages.clientInitials

  if (!image) {
    const borderColor = resolveBrandColor(ctx.data.template, 'border')
    ctx.page.drawRectangle({
      x: element.x,
      y: pdfY(ctx, topY + height),
      width,
      height,
      borderColor,
      borderWidth: 1,
    })
  }

  if (image) {
    const padding = 6
    const availableWidth = width - padding * 2
    const availableHeight = height - padding * 2
    const scale = Math.min(availableWidth / image.width, availableHeight / image.height)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    const offsetY = topY + padding + (availableHeight - drawHeight) / 2
    ctx.page.drawImage(image, {
      x: element.x + padding,
      y: pdfY(ctx, offsetY + drawHeight),
      width: drawWidth,
      height: drawHeight,
    })
  } else {
    drawTextBlock(
      ctx,
      { ...element, fontSize: element.fontSize || 9 },
      topY + height / 2 - 6,
      label,
      'muted'
    )
  }

  return topY + height + 8
}

function resolveBrandColor(template: DocumentTemplate, key: keyof typeof DEFAULT_BRAND_COLORS): RGB {
  const hex = template.brandColors?.[key] || DEFAULT_BRAND_COLORS[key] || '#1a1a1a'
  return parseColor(hex)
}

function renderStaticText(ctx: RenderContext, element: DocumentElement, topY: number): number {
  return drawTextBlock(ctx, element, topY, element.text || '')
}

function renderLine(ctx: RenderContext, element: DocumentElement, topY: number): number {
  const y = pdfY(ctx, topY)
  const width = element.width || ctx.pageWidth - ctx.margin * 2
  ctx.page.drawLine({
    start: { x: element.x, y },
    end: { x: element.x + width, y },
    thickness: 1,
    color: resolveBrandColor(ctx.data.template, 'border'),
  })
  return topY + 12
}

function resolveTableColumnPositions(template: DocumentTemplate, element: DocumentElement) {
  const columns = template.tableColumns || DEFAULT_TABLE_COLUMNS
  return {
    desc: element.x,
    qty: element.x + columns.qty,
    unit: element.x + columns.unit,
    amount: element.x + columns.amount,
  }
}

function renderPaginatedLineItemsTable(
  ctx: RenderContext,
  element: DocumentElement
): { ctx: RenderContext; endY: number } {
  const items = ctx.data.lineItems
  if (items.length === 0) {
    return { ctx, endY: element.y }
  }

  let currentCtx = ctx
  let currentTopY = element.y
  let itemIndex = 0
  let pageIndex = 0

  while (itemIndex < items.length) {
    const availableHeight =
      pageIndex === 0
        ? ctx.pageHeight - element.y - MARGIN - FOOTER_RESERVE
        : ctx.pageHeight - MARGIN * 2 - FOOTER_RESERVE

    const headerHeight = 38
    const maxRowsHeight = Math.max(48, availableHeight - headerHeight)
    const pageItems: typeof items = []
    let usedHeight = 0

    while (itemIndex < items.length) {
      const item = items[itemIndex]
      const descLines = wrapText(item.description, TABLE_DESC_WRAP)
      const rowHeight = TABLE_ROW_HEIGHT + Math.max(0, descLines.length - 1) * 14

      if (pageItems.length > 0 && usedHeight + rowHeight > maxRowsHeight) {
        break
      }

      pageItems.push(item)
      usedHeight += rowHeight
      itemIndex += 1

      if (usedHeight >= maxRowsHeight) break
    }

    if (pageIndex > 0) {
      currentCtx = addPage(currentCtx)
      currentTopY = MARGIN
    }

    currentTopY = renderLineItemsTable(currentCtx, element, currentTopY, pageItems)
    pageIndex += 1
  }

  return { ctx: currentCtx, endY: currentTopY }
}

function renderLineItemsTable(
  ctx: RenderContext,
  element: DocumentElement,
  topY: number,
  items: DocumentRenderData['lineItems']
): number {
  const tableWidth = element.width || ctx.pageWidth - ctx.margin * 2
  const colX = resolveTableColumnPositions(ctx.data.template, element)
  const borderColor = resolveBrandColor(ctx.data.template, 'border')
  const primaryColor = resolveBrandColor(ctx.data.template, 'primary')

  let currentTopY = topY
  const lineY = pdfY(ctx, currentTopY)
  ctx.page.drawLine({
    start: { x: element.x, y: lineY },
    end: { x: element.x + tableWidth, y: lineY },
    thickness: 1,
    color: borderColor,
  })
  currentTopY += 18

  const headerPdfY = pdfY(ctx, textBaselineFromTop(currentTopY, 10))
  drawAlignedText(ctx.page, 'Description', colX.desc, headerPdfY, 10, ctx.fonts.bold, primaryColor)
  drawAlignedText(ctx.page, 'Qty', colX.qty, headerPdfY, 10, ctx.fonts.bold, primaryColor)
  drawAlignedText(ctx.page, 'Unit Price', colX.unit, headerPdfY, 10, ctx.fonts.bold, primaryColor)
  drawAlignedText(ctx.page, 'Amount', colX.amount, headerPdfY, 10, ctx.fonts.bold, primaryColor)
  currentTopY += 20

  for (const item of items) {
    const rowPdfY = pdfY(ctx, textBaselineFromTop(currentTopY, 10))
    const descLines = wrapText(item.description, TABLE_DESC_WRAP)
    drawAlignedText(ctx.page, descLines[0] || '', colX.desc, rowPdfY, 10, ctx.fonts.regular)
    drawAlignedText(ctx.page, String(item.quantity), colX.qty, rowPdfY, 10, ctx.fonts.regular)
    drawAlignedText(
      ctx.page,
      formatCurrency(item.unit_price),
      colX.unit,
      rowPdfY,
      10,
      ctx.fonts.regular
    )
    drawAlignedText(
      ctx.page,
      formatCurrency(item.amount),
      colX.amount,
      rowPdfY,
      10,
      ctx.fonts.regular
    )
    currentTopY += TABLE_ROW_HEIGHT

    for (let index = 1; index < descLines.length; index++) {
      drawAlignedText(
        ctx.page,
        descLines[index],
        colX.desc,
        pdfY(ctx, textBaselineFromTop(currentTopY, 10)),
        10,
        ctx.fonts.regular
      )
      currentTopY += 14
    }
  }

  currentTopY += 8
  const bottomLineY = pdfY(ctx, currentTopY)
  ctx.page.drawLine({
    start: { x: element.x, y: bottomLineY },
    end: { x: element.x + tableWidth, y: bottomLineY },
    thickness: 1,
    color: borderColor,
  })

  return currentTopY + 22
}

function renderPaymentsSection(
  ctx: RenderContext,
  element: DocumentElement,
  topY: number
): number {
  if (ctx.data.kind !== 'invoice') return topY
  if (ctx.data.template.showPayments === false) return topY

  const payments = ctx.data.payments || []
  if (payments.length === 0) return topY

  let currentTopY = topY
  const colX = { desc: element.x, amount: element.x + 420 }
  const accentColor = resolveBrandColor(ctx.data.template, 'accent')

  drawTextBlock(ctx, { ...element, fontWeight: 'bold', fontSize: 10 }, currentTopY, 'Payments')
  currentTopY += 16

  for (const payment of payments) {
    const rowPdfY = pdfY(ctx, textBaselineFromTop(currentTopY, 9))
    const label = `${new Date(payment.payment_date).toLocaleDateString()} · ${payment.method}`
    drawAlignedText(
      ctx.page,
      label,
      colX.desc,
      rowPdfY,
      9,
      ctx.fonts.regular,
      resolveBrandColor(ctx.data.template, 'muted')
    )
    drawAlignedText(
      ctx.page,
      `-${formatCurrency(payment.amount)}`,
      colX.amount,
      rowPdfY,
      9,
      ctx.fonts.regular,
      accentColor
    )
    currentTopY += 14
  }

  currentTopY += 6
  const totalPaidPdfY = pdfY(ctx, textBaselineFromTop(currentTopY, 11))
  drawAlignedText(ctx.page, 'Total paid', element.x + 340, totalPaidPdfY, 11, ctx.fonts.regular)
  drawAlignedText(
    ctx.page,
    formatCurrency(ctx.data.summary.totalPaid || 0),
    colX.amount,
    totalPaidPdfY,
    11,
    ctx.fonts.regular,
    accentColor
  )

  return currentTopY + 20
}

function renderInstallmentsSection(
  ctx: RenderContext,
  element: DocumentElement,
  topY: number
): number {
  if (ctx.data.kind !== 'invoice') return topY

  const installments = ctx.data.installments || []
  if (installments.length === 0) return topY

  let currentTopY = topY
  const colX = {
    desc: element.x,
    status: element.x + 280,
    amount: element.x + 420,
  }
  const muted = resolveBrandColor(ctx.data.template, 'muted')
  const accentColor = resolveBrandColor(ctx.data.template, 'accent')

  drawTextBlock(
    ctx,
    { ...element, fontWeight: 'bold', fontSize: 10 },
    currentTopY,
    'Payment schedule'
  )
  currentTopY += 16

  for (const row of installments) {
    const rowPdfY = pdfY(ctx, textBaselineFromTop(currentTopY, 9))
    const duePart = row.dueDate
      ? ` · due ${new Date(
          row.dueDate.includes('T') ? row.dueDate : `${row.dueDate}T12:00:00`
        ).toLocaleDateString()}`
      : ''
    const label = `${row.label}${duePart}`
    drawAlignedText(ctx.page, label, colX.desc, rowPdfY, 9, ctx.fonts.regular, muted)
    drawAlignedText(
      ctx.page,
      row.statusLabel,
      colX.status,
      rowPdfY,
      9,
      ctx.fonts.regular,
      muted
    )
    const amountText =
      row.remaining > 0.009 && row.amountPaid > 0.009
        ? `${formatCurrency(row.remaining)} left`
        : formatCurrency(row.amountDue)
    drawAlignedText(
      ctx.page,
      amountText,
      colX.amount,
      rowPdfY,
      9,
      ctx.fonts.regular,
      accentColor
    )
    currentTopY += 14
  }

  return currentTopY + 12
}

function renderInvoiceTotals(ctx: RenderContext, element: DocumentElement, topY: number): number {
  if (ctx.data.kind !== 'invoice') return topY

  let currentTopY = topY
  const colX = { unit: element.x + 340, amount: element.x + 420 }
  const totalCharged = ctx.data.summary.totalCharged || 0
  const balanceDue = ctx.data.summary.balanceDue || 0
  const accentColor = resolveBrandColor(ctx.data.template, 'accent')
  const borderColor = resolveBrandColor(ctx.data.template, 'border')

  const subtotalPdfY = pdfY(ctx, textBaselineFromTop(currentTopY, 11))
  drawAlignedText(ctx.page, 'Subtotal', colX.unit, subtotalPdfY, 11, ctx.fonts.regular)
  drawAlignedText(
    ctx.page,
    formatCurrency(totalCharged),
    colX.amount,
    subtotalPdfY,
    11,
    ctx.fonts.regular
  )
  currentTopY += 18

  const dividerY = pdfY(ctx, currentTopY)
  ctx.page.drawLine({
    start: { x: ctx.margin, y: dividerY },
    end: { x: ctx.pageWidth - ctx.margin, y: dividerY },
    thickness: 1,
    color: borderColor,
  })
  currentTopY += 22

  const balancePdfY = pdfY(ctx, textBaselineFromTop(currentTopY, 12))
  drawAlignedText(ctx.page, 'Balance due', colX.unit, balancePdfY, 12, ctx.fonts.bold)
  drawAlignedText(
    ctx.page,
    formatCurrency(balanceDue),
    colX.amount,
    balancePdfY,
    12,
    ctx.fonts.bold,
    balanceDue > 0 ? rgb(0.7, 0.2, 0.1) : accentColor
  )

  return currentTopY + 30
}

function renderEstimateTotal(ctx: RenderContext, element: DocumentElement, topY: number): number {
  if (ctx.data.kind !== 'estimate') return topY

  const colX = { unit: element.x + 340, amount: element.x + 420 }
  const totalPdfY = pdfY(ctx, textBaselineFromTop(topY, 12))
  drawAlignedText(ctx.page, 'Total', colX.unit, totalPdfY, 12, ctx.fonts.bold)
  drawAlignedText(
    ctx.page,
    formatCurrency(ctx.data.summary.total || 0),
    colX.amount,
    totalPdfY,
    12,
    ctx.fonts.bold,
    resolveBrandColor(ctx.data.template, 'accent')
  )

  return topY + 40
}

function renderFooter(ctx: RenderContext, element: DocumentElement, topY: number): number {
  const balanceDue = ctx.data.summary.balanceDue ?? 0
  const text =
    ctx.data.kind === 'invoice'
      ? balanceDue > 0
        ? ctx.data.template.footerDueText || ''
        : ctx.data.template.footerPaidText || 'Paid in full — thank you for your business.'
      : ctx.data.template.footerDueText || 'Thank you for your business.'

  return drawTextBlock(ctx, element, topY, text, 'muted')
}

function drawTextBlock(
  ctx: RenderContext,
  element: DocumentElement,
  topY: number,
  text: string,
  fallbackColor: keyof typeof DEFAULT_BRAND_COLORS = 'primary'
): number {
  const fontSize = element.fontSize || 10
  const font = element.fontWeight === 'bold' ? ctx.fonts.bold : ctx.fonts.regular
  const color = element.color
    ? parseColor(element.color)
    : resolveBrandColor(ctx.data.template, fallbackColor)
  const width = element.width || ctx.pageWidth - element.x - ctx.margin
  const lines = wrapText(text, Math.max(12, Math.floor(width / (fontSize * 0.55))))

  let currentTopY = topY
  for (const line of lines) {
    drawAlignedText(
      ctx.page,
      line,
      element.x,
      pdfY(ctx, textBaselineFromTop(currentTopY, fontSize)),
      fontSize,
      font,
      color,
      element.align || 'left',
      width
    )
    currentTopY += fontSize + 6
  }

  return currentTopY
}

function drawOptionalText(
  ctx: RenderContext,
  element: DocumentElement,
  topY: number,
  value?: string | null,
  fallbackColor: keyof typeof DEFAULT_BRAND_COLORS = 'primary'
): number {
  if (!value?.trim()) return topY
  return drawTextBlock(ctx, element, topY, value.trim(), fallbackColor)
}

function drawWrappedOptionalText(
  ctx: RenderContext,
  element: DocumentElement,
  topY: number,
  value: string | null | undefined,
  maxChars: number,
  fallbackColor: keyof typeof DEFAULT_BRAND_COLORS = 'primary'
): number {
  if (!value?.trim()) return topY

  const fontSize = element.fontSize || 10
  const font = element.fontWeight === 'bold' ? ctx.fonts.bold : ctx.fonts.regular
  const color = element.color
    ? parseColor(element.color)
    : resolveBrandColor(ctx.data.template, fallbackColor)
  let currentTopY = topY

  for (const line of wrapText(value.trim(), maxChars)) {
    drawAlignedText(
      ctx.page,
      line,
      element.x,
      pdfY(ctx, textBaselineFromTop(currentTopY, fontSize)),
      fontSize,
      font,
      color,
      element.align || 'left',
      element.width
    )
    currentTopY += fontSize + 6
  }

  return currentTopY
}

function drawAlignedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: FontSet['regular'],
  color: RGB = rgb(0.1, 0.1, 0.1),
  align: 'left' | 'center' | 'right' = 'left',
  width?: number
) {
  let drawX = x
  if (width && align !== 'left') {
    const textWidth = font.widthOfTextAtSize(text, size)
    if (align === 'right') {
      drawX = x + width - textWidth
    } else if (align === 'center') {
      drawX = x + (width - textWidth) / 2
    }
  }

  page.drawText(text, { x: drawX, y, size, font, color })
}

function pdfY(ctx: RenderContext, topY: number): number {
  return ctx.pageHeight - topY
}

function parseColor(color?: string): RGB {
  if (!color) return rgb(0.1, 0.1, 0.1)
  const hex = color.replace('#', '')
  if (hex.length !== 6) return rgb(0.1, 0.1, 0.1)
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  return rgb(r, g, b)
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars) {
      if (current) lines.push(current)
      current = word
    } else {
      current = next
    }
  }

  if (current) lines.push(current)
  return lines.length ? lines : ['']
}