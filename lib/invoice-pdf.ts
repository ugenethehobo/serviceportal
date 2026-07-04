import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'
import { formatCurrency } from '@/lib/billing'
import {
  getEnabledTemplateBlocks,
  type InvoiceTemplate,
  type InvoiceTemplateBlockType,
} from '@/lib/invoice-template'

interface InvoicePaymentRow {
  payment_date: string
  method: string
  amount: number
}

interface InvoicePdfData {
  invoice: {
    number: string
    issuedAt: string
    jobTitle: string
    visitDate: string | null
    status: string
  }
  lineItems: Array<{
    description: string
    quantity: number
    unit_price: number
    amount: number
  }>
  payments: InvoicePaymentRow[]
  summary: {
    totalCharged: number
    totalPaid: number
    balanceDue: number
  }
  company: { name: string; address?: string | null; phone?: string | null }
  client: {
    name: string
    contact_name?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
  }
  template: InvoiceTemplate
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 50

type DrawContext = {
  page: PDFPage
  font: Awaited<ReturnType<PDFDocument['embedFont']>>
  fontBold: Awaited<ReturnType<PDFDocument['embedFont']>>
  y: number
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const ctx: DrawContext = { page, font, fontBold, y: PAGE_HEIGHT - MARGIN }
  const enabledBlocks = getEnabledTemplateBlocks(data.template)
  const issuedDate = new Date(data.invoice.issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  for (const block of enabledBlocks) {
    ctx.y = renderBlock(ctx, block.type, data, issuedDate)
    if (ctx.y < MARGIN + 80) break
  }

  return pdf.save()
}

function renderBlock(
  ctx: DrawContext,
  type: InvoiceTemplateBlockType,
  data: InvoicePdfData,
  issuedDate: string
): number {
  switch (type) {
    case 'company_header':
      return drawCompanyHeader(ctx, data)
    case 'invoice_meta':
      return drawInvoiceMeta(ctx, data, issuedDate)
    case 'bill_to':
      return drawBillTo(ctx, data)
    case 'job_details':
      return drawJobDetails(ctx, data)
    case 'line_items':
      return drawLineItems(ctx, data)
    case 'payments':
      return data.template.showPayments ? drawPayments(ctx, data) : ctx.y
    case 'totals':
      return drawTotals(ctx, data)
    case 'footer':
      return drawFooter(ctx, data)
    default:
      return ctx.y
  }
}

function drawText(
  ctx: DrawContext,
  text: string,
  x: number,
  size: number,
  bold = false,
  color = rgb(0.1, 0.1, 0.1)
) {
  ctx.page.drawText(text, {
    x,
    y: ctx.y,
    size,
    font: bold ? ctx.fontBold : ctx.font,
    color,
  })
  ctx.y -= size + 6
}

function drawCompanyHeader(ctx: DrawContext, data: InvoicePdfData) {
  drawText(ctx, data.company.name, MARGIN, 20, true)
  if (data.company.address) {
    drawText(ctx, data.company.address, MARGIN, 10, false, rgb(0.35, 0.35, 0.35))
  }
  if (data.company.phone) {
    drawText(ctx, data.company.phone, MARGIN, 10, false, rgb(0.35, 0.35, 0.35))
  }
  drawText(ctx, 'INVOICE', MARGIN, 14, true, rgb(0.3, 0.3, 0.3))
  ctx.y -= 4
  return ctx.y
}

function drawInvoiceMeta(ctx: DrawContext, data: InvoicePdfData, issuedDate: string) {
  ctx.page.drawText(`Invoice #: ${data.invoice.number}`, {
    x: PAGE_WIDTH - MARGIN - 200,
    y: PAGE_HEIGHT - MARGIN - 20,
    size: 10,
    font: ctx.font,
    color: rgb(0.4, 0.4, 0.4),
  })
  ctx.page.drawText(`Date: ${issuedDate}`, {
    x: PAGE_WIDTH - MARGIN - 200,
    y: PAGE_HEIGHT - MARGIN - 36,
    size: 10,
    font: ctx.font,
    color: rgb(0.4, 0.4, 0.4),
  })
  ctx.y -= 8
  return ctx.y
}

function drawBillTo(ctx: DrawContext, data: InvoicePdfData) {
  const label =
    data.template.blocks.find((b) => b.type === 'bill_to')?.label?.trim() || 'Bill To'
  drawText(ctx, label, MARGIN, 11, true, rgb(0.4, 0.4, 0.4))
  drawText(ctx, data.client.name, MARGIN, 12, true)
  if (data.client.contact_name) drawText(ctx, data.client.contact_name, MARGIN, 10)
  if (data.client.address) drawText(ctx, data.client.address, MARGIN, 10)
  if (data.client.email) drawText(ctx, data.client.email, MARGIN, 10)
  if (data.client.phone) drawText(ctx, data.client.phone, MARGIN, 10)
  ctx.y -= 12
  return ctx.y
}

function drawJobDetails(ctx: DrawContext, data: InvoicePdfData) {
  drawText(ctx, data.invoice.jobTitle, MARGIN, 16, true)
  if (data.invoice.visitDate) {
    drawText(ctx, `Visit: ${data.invoice.visitDate}`, MARGIN, 10, false, rgb(0.35, 0.35, 0.35))
  }
  ctx.y -= 16
  return ctx.y
}

function drawLineItems(ctx: DrawContext, data: InvoicePdfData) {
  const colX = {
    desc: MARGIN,
    qty: MARGIN + 280,
    unit: MARGIN + 340,
    amount: MARGIN + 420,
  }

  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  })
  ctx.y -= 18

  const headerY = ctx.y
  ctx.page.drawText('Description', { x: colX.desc, y: headerY, size: 10, font: ctx.fontBold })
  ctx.page.drawText('Qty', { x: colX.qty, y: headerY, size: 10, font: ctx.fontBold })
  ctx.page.drawText('Unit Price', { x: colX.unit, y: headerY, size: 10, font: ctx.fontBold })
  ctx.page.drawText('Amount', { x: colX.amount, y: headerY, size: 10, font: ctx.fontBold })
  ctx.y -= 20

  for (const item of data.lineItems) {
    if (ctx.y < MARGIN + 140) break
    const descLines = wrapText(item.description, 42)
    ctx.page.drawText(descLines[0] || '', { x: colX.desc, y: ctx.y, size: 10, font: ctx.font })
    ctx.page.drawText(String(item.quantity), { x: colX.qty, y: ctx.y, size: 10, font: ctx.font })
    ctx.page.drawText(formatCurrency(item.unit_price), {
      x: colX.unit,
      y: ctx.y,
      size: 10,
      font: ctx.font,
    })
    ctx.page.drawText(formatCurrency(item.amount), {
      x: colX.amount,
      y: ctx.y,
      size: 10,
      font: ctx.font,
    })
    ctx.y -= 16
    for (let i = 1; i < descLines.length; i++) {
      ctx.page.drawText(descLines[i], { x: colX.desc, y: ctx.y, size: 10, font: ctx.font })
      ctx.y -= 14
    }
  }

  ctx.y -= 8
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  })
  ctx.y -= 22
  return ctx.y
}

function drawPayments(ctx: DrawContext, data: InvoicePdfData) {
  if (data.payments.length === 0) return ctx.y

  const colX = { desc: MARGIN, amount: MARGIN + 420 }
  ctx.page.drawText('Payments', { x: colX.desc, y: ctx.y, size: 10, font: ctx.fontBold })
  ctx.y -= 16

  for (const payment of data.payments) {
    if (ctx.y < MARGIN + 100) break
    const label = `${new Date(payment.payment_date).toLocaleDateString()} · ${payment.method}`
    ctx.page.drawText(label, {
      x: colX.desc,
      y: ctx.y,
      size: 9,
      font: ctx.font,
      color: rgb(0.4, 0.4, 0.4),
    })
    ctx.page.drawText(`-${formatCurrency(payment.amount)}`, {
      x: colX.amount,
      y: ctx.y,
      size: 9,
      font: ctx.font,
      color: rgb(0.2, 0.45, 0.25),
    })
    ctx.y -= 14
  }

  ctx.y -= 6
  ctx.page.drawText('Total paid', { x: MARGIN + 340, y: ctx.y, size: 11, font: ctx.font })
  ctx.page.drawText(formatCurrency(data.summary.totalPaid), {
    x: colX.amount,
    y: ctx.y,
    size: 11,
    font: ctx.font,
    color: rgb(0.2, 0.45, 0.25),
  })
  ctx.y -= 20
  return ctx.y
}

function drawTotals(ctx: DrawContext, data: InvoicePdfData) {
  const colX = { unit: MARGIN + 340, amount: MARGIN + 420 }

  ctx.page.drawText('Subtotal', { x: colX.unit, y: ctx.y, size: 11, font: ctx.font })
  ctx.page.drawText(formatCurrency(data.summary.totalCharged), {
    x: colX.amount,
    y: ctx.y,
    size: 11,
    font: ctx.font,
  })
  ctx.y -= 18

  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  })
  ctx.y -= 22

  ctx.page.drawText('Balance due', { x: colX.unit, y: ctx.y, size: 12, font: ctx.fontBold })
  ctx.page.drawText(formatCurrency(data.summary.balanceDue), {
    x: colX.amount,
    y: ctx.y,
    size: 12,
    font: ctx.fontBold,
    color:
      data.summary.balanceDue > 0 ? rgb(0.7, 0.2, 0.1) : rgb(0.1, 0.45, 0.2),
  })
  ctx.y -= 30
  return ctx.y
}

function drawFooter(ctx: DrawContext, data: InvoicePdfData) {
  const text =
    data.summary.balanceDue > 0
      ? data.template.footerText
      : 'Paid in full — thank you for your business.'
  ctx.page.drawText(text, {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: ctx.font,
    color: rgb(0.5, 0.5, 0.5),
  })
  ctx.y -= 30
  return ctx.y
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