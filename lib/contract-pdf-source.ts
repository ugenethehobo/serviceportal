import { degrees, PDFDocument } from 'pdf-lib'
import { MAX_CONTRACT_PAGES, type DocumentPageSize } from '@/lib/document-template'

/** Server actions accept 12 MB bodies (next.config.ts); leave headroom for form overhead. */
export const CONTRACT_PDF_MAX_BYTES = 10 * 1024 * 1024
export const CONTRACT_PDF_MAX_PAGES = MAX_CONTRACT_PAGES

export type PreparedContractPdf = {
  bytes: Uint8Array
  pageSizes: DocumentPageSize[]
  normalized: boolean
}

export class ContractPdfError extends Error {}

function isPdfHeader(bytes: Uint8Array) {
  // Allow a few bytes of leading garbage, which some generators emit before %PDF-.
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1')
  return head.includes('%PDF-')
}

function roundSize(value: number) {
  return Math.round(value * 100) / 100
}

/**
 * Validates an uploaded PDF and returns bytes the contract renderer can draw on directly.
 *
 * Editor coordinates are top-left based on each page's visible area. Pages whose crop box
 * is offset from the media box, or which carry a /Rotate, would place fields in the wrong
 * spot, so those documents are re-laid out onto plain upright pages. Interactive form
 * fields are flattened so the client can't edit the underlying document.
 */
export async function prepareContractPdf(input: Uint8Array): Promise<PreparedContractPdf> {
  try {
    return await preparePdf(input)
  } catch (error) {
    if (error instanceof ContractPdfError) throw error
    throw new ContractPdfError(
      'This PDF could not be processed. Try printing it to a new PDF and uploading that.'
    )
  }
}

async function preparePdf(input: Uint8Array): Promise<PreparedContractPdf> {
  if (input.length === 0) throw new ContractPdfError('The PDF is empty')
  if (input.length > CONTRACT_PDF_MAX_BYTES) {
    throw new ContractPdfError('PDF must be 10 MB or smaller')
  }
  if (!isPdfHeader(input)) throw new ContractPdfError('File is not a valid PDF')

  let source: PDFDocument
  try {
    source = await PDFDocument.load(input, { updateMetadata: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/encrypt/i.test(message)) {
      throw new ContractPdfError(
        'This PDF is password protected. Remove the protection and upload it again.'
      )
    }
    throw new ContractPdfError('This PDF could not be read. Try re-saving it as a PDF.')
  }

  let pageCount: number
  try {
    // A damaged file can parse without a usable page tree; that surfaces here.
    pageCount = source.getPageCount()
    source.getPages().forEach((page) => page.getSize())
  } catch {
    throw new ContractPdfError('This PDF could not be read. Try re-saving it as a PDF.')
  }
  if (pageCount === 0) throw new ContractPdfError('The PDF has no pages')
  if (pageCount > CONTRACT_PDF_MAX_PAGES) {
    throw new ContractPdfError(`PDF must have ${CONTRACT_PDF_MAX_PAGES} pages or fewer`)
  }

  try {
    const form = source.getForm()
    if (form.getFields().length > 0) form.flatten()
  } catch {
    // Broken AcroForms are common; the page content still renders without them.
  }

  const pages = source.getPages()
  const needsNormalization = pages.some((page) => {
    const rotation = ((page.getRotation().angle % 360) + 360) % 360
    const media = page.getMediaBox()
    const crop = page.getCropBox()
    return (
      rotation !== 0 ||
      media.x !== 0 ||
      media.y !== 0 ||
      crop.x !== media.x ||
      crop.y !== media.y ||
      crop.width !== media.width ||
      crop.height !== media.height
    )
  })

  if (!needsNormalization) {
    return {
      bytes: await source.save(),
      pageSizes: pages.map((page) => {
        const { width, height } = page.getSize()
        return { width: roundSize(width), height: roundSize(height) }
      }),
      normalized: false,
    }
  }

  const output = await PDFDocument.create()
  const pageSizes: DocumentPageSize[] = []

  for (const page of pages) {
    const crop = page.getCropBox()
    const rotation = ((page.getRotation().angle % 360) + 360) % 360
    const embedded = await output.embedPage(page, {
      left: crop.x,
      bottom: crop.y,
      right: crop.x + crop.width,
      top: crop.y + crop.height,
    })

    const quarterTurn = rotation === 90 || rotation === 270
    const width = quarterTurn ? crop.height : crop.width
    const height = quarterTurn ? crop.width : crop.height
    const target = output.addPage([width, height])

    // /Rotate is clockwise; drawPage rotates counter-clockwise about (x, y).
    if (rotation === 90) {
      target.drawPage(embedded, { x: 0, y: height, rotate: degrees(-90) })
    } else if (rotation === 180) {
      target.drawPage(embedded, { x: width, y: height, rotate: degrees(180) })
    } else if (rotation === 270) {
      target.drawPage(embedded, { x: width, y: 0, rotate: degrees(90) })
    } else {
      target.drawPage(embedded, { x: 0, y: 0 })
    }

    pageSizes.push({ width: roundSize(width), height: roundSize(height) })
  }

  return { bytes: await output.save(), pageSizes, normalized: true }
}

export function sanitizePdfFileName(name: string) {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_')
  const trimmed = base.slice(0, 120) || 'contract'
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`
}
