import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { degrees, PDFDocument, StandardFonts } from 'pdf-lib'
import {
  CONTRACT_PDF_MAX_PAGES,
  ContractPdfError,
  prepareContractPdf,
  sanitizePdfFileName,
} from '@/lib/contract-pdf-source'

async function makePdf(
  pages: Array<{ size: [number, number]; rotate?: number; crop?: [number, number, number, number] }>
) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const spec of pages) {
    const page = pdf.addPage(spec.size)
    page.drawText('Contract body', { x: 72, y: spec.size[1] - 72, size: 12, font })
    if (spec.rotate) page.setRotation(degrees(spec.rotate))
    if (spec.crop) page.setCropBox(...spec.crop)
  }
  return pdf.save()
}

describe('prepareContractPdf', () => {
  it('keeps simple PDFs as-is and reports page sizes', async () => {
    const prepared = await prepareContractPdf(
      await makePdf([{ size: [612, 792] }, { size: [595.28, 841.89] }])
    )
    assert.equal(prepared.normalized, false)
    assert.deepEqual(prepared.pageSizes, [
      { width: 612, height: 792 },
      { width: 595.28, height: 841.89 },
    ])
  })

  it('re-lays rotated pages upright so field coordinates match the preview', async () => {
    const prepared = await prepareContractPdf(
      await makePdf([{ size: [612, 792], rotate: 90 }, { size: [612, 792], rotate: 180 }])
    )
    assert.equal(prepared.normalized, true)
    assert.deepEqual(prepared.pageSizes, [
      { width: 792, height: 612 },
      { width: 612, height: 792 },
    ])
    const output = await PDFDocument.load(prepared.bytes)
    for (const page of output.getPages()) assert.equal(page.getRotation().angle, 0)
  })

  it('uses the visible crop box as the page', async () => {
    const prepared = await prepareContractPdf(
      await makePdf([{ size: [700, 900], crop: [36, 36, 612, 792] }])
    )
    assert.equal(prepared.normalized, true)
    assert.deepEqual(prepared.pageSizes, [{ width: 612, height: 792 }])
    const page = (await PDFDocument.load(prepared.bytes)).getPage(0)
    assert.deepEqual(page.getMediaBox(), { x: 0, y: 0, width: 612, height: 792 })
  })

  it('rejects files that are not usable PDFs', async () => {
    await assert.rejects(prepareContractPdf(new Uint8Array()), ContractPdfError)
    await assert.rejects(
      prepareContractPdf(new TextEncoder().encode('not a pdf at all')),
      /not a valid PDF/
    )
    await assert.rejects(
      prepareContractPdf(new TextEncoder().encode('%PDF-1.7\ngarbage')),
      ContractPdfError
    )
  })

  it('enforces the page limit', async () => {
    const pages = Array.from({ length: CONTRACT_PDF_MAX_PAGES + 1 }, () => ({
      size: [200, 200] as [number, number],
    }))
    await assert.rejects(prepareContractPdf(await makePdf(pages)), /pages or fewer/)
  })

  it('sanitizes stored file names', () => {
    assert.equal(sanitizePdfFileName('My Contract (v2).PDF'), 'My_Contract_v2_.PDF')
    assert.equal(sanitizePdfFileName('../../etc/passwd'), '.._.._etc_passwd.pdf')
  })
})
