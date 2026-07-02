import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { formatCurrency } from '@/lib/billing'
import { formatEstimateNumber } from '@/lib/estimates'

interface EstimatePdfData {
  estimate: {
    id: string
    title: string
    description: string | null
    status: string
    total: number
    created_at: string
  }
  lineItems: Array<{
    description: string
    quantity: number
    unit_price: number
    amount: number
  }>
  company: { name: string }
  client: {
    name: string
    contact_name?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
  }
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 50

export async function generateEstimatePdf(data: EstimatePdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let y = PAGE_HEIGHT - MARGIN

  const drawText = (
    text: string,
    x: number,
    size: number,
    bold = false,
    color = rgb(0.1, 0.1, 0.1)
  ) => {
    page.drawText(text, { x, y, size, font: bold ? fontBold : font, color })
    y -= size + 6
  }

  const estimateNumber = formatEstimateNumber(data.estimate.id, data.estimate.created_at)
  const createdDate = new Date(data.estimate.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  drawText(data.company.name, MARGIN, 20, true)
  drawText('ESTIMATE', MARGIN, 14, true, rgb(0.3, 0.3, 0.3))
  y -= 4

  page.drawText(`Estimate #: ${estimateNumber}`, {
    x: PAGE_WIDTH - MARGIN - 180,
    y: PAGE_HEIGHT - MARGIN - 20,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  })
  page.drawText(`Date: ${createdDate}`, {
    x: PAGE_WIDTH - MARGIN - 180,
    y: PAGE_HEIGHT - MARGIN - 36,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  })

  y -= 8
  drawText('Bill To', MARGIN, 11, true, rgb(0.4, 0.4, 0.4))
  drawText(data.client.name, MARGIN, 12, true)
  if (data.client.contact_name) drawText(data.client.contact_name, MARGIN, 10)
  if (data.client.address) drawText(data.client.address, MARGIN, 10)
  if (data.client.email) drawText(data.client.email, MARGIN, 10)
  if (data.client.phone) drawText(data.client.phone, MARGIN, 10)

  y -= 12
  drawText(data.estimate.title, MARGIN, 16, true)
  if (data.estimate.description) {
    const descLines = wrapText(data.estimate.description, 80)
    for (const line of descLines) {
      drawText(line, MARGIN, 10, false, rgb(0.35, 0.35, 0.35))
    }
  }

  y -= 16

  const colX = {
    desc: MARGIN,
    qty: MARGIN + 280,
    unit: MARGIN + 340,
    amount: MARGIN + 420,
  }

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  })
  y -= 18

  const headerY = y
  page.drawText('Description', { x: colX.desc, y: headerY, size: 10, font: fontBold })
  page.drawText('Qty', { x: colX.qty, y: headerY, size: 10, font: fontBold })
  page.drawText('Unit Price', { x: colX.unit, y: headerY, size: 10, font: fontBold })
  page.drawText('Amount', { x: colX.amount, y: headerY, size: 10, font: fontBold })
  y -= 20

  for (const item of data.lineItems) {
    if (y < MARGIN + 80) break

    const descLines = wrapText(item.description, 42)
    page.drawText(descLines[0] || '', { x: colX.desc, y, size: 10, font })
    page.drawText(String(item.quantity), { x: colX.qty, y, size: 10, font })
    page.drawText(formatCurrency(item.unit_price), { x: colX.unit, y, size: 10, font })
    page.drawText(formatCurrency(item.amount), { x: colX.amount, y, size: 10, font })
    y -= 16

    for (let i = 1; i < descLines.length; i++) {
      page.drawText(descLines[i], { x: colX.desc, y, size: 10, font })
      y -= 14
    }
  }

  y -= 8
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  })
  y -= 24

  page.drawText('Total', { x: colX.unit, y, size: 12, font: fontBold })
  page.drawText(formatCurrency(data.estimate.total), {
    x: colX.amount,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0.1, 0.45, 0.2),
  })

  y -= 40
  page.drawText('Thank you for your business.', {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  })

  return pdf.save()
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