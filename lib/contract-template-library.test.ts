import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { extractContractSigningRequirements } from '@/lib/contract-signing'
import { CONTRACT_STARTERS, getContractStarter } from '@/lib/contract-template-library'
import { getDocumentPageCount, getDocumentPageSize } from '@/lib/document-template'
import { getElementBounds } from '@/lib/document-template-editor-utils'
import { measureWrappedTextHeight } from '@/lib/document-template-renderer'

describe('contract starter library', () => {
  it('exposes unique starters that build valid contract templates', () => {
    const ids = new Set(CONTRACT_STARTERS.map((starter) => starter.id))
    assert.equal(ids.size, CONTRACT_STARTERS.length)

    for (const starter of CONTRACT_STARTERS) {
      const template = starter.build()
      assert.equal(template.version, 2, starter.id)
      const requirements = extractContractSigningRequirements(template)
      assert.equal(requirements.requiresSignature, true, `${starter.id} needs a signature`)
      const elementIds = template.elements.map((element) => element.id)
      assert.equal(new Set(elementIds).size, elementIds.length, `${starter.id} has duplicate ids`)
    }
  })

  it('sizes every text block for its real rendered height', async () => {
    const pdf = await PDFDocument.create()
    const fonts = {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    }

    for (const starter of CONTRACT_STARTERS) {
      if (starter.id === 'simple-agreement') continue
      const template = starter.build()
      for (const element of template.elements) {
        if (element.kind !== 'text') continue
        const font = element.fontWeight === 'bold' ? fonts.bold : fonts.regular
        // Merge tags can expand; measure with realistic long values substituted.
        const text = (element.text || '').replace(
          /\{\{[^}]+\}\}/g,
          'Evergreen Property Management LLC'
        )
        const actual = measureWrappedTextHeight(text, font, element.fontSize || 10, element.width || 512)
        assert.ok(
          actual <= (element.height || 0) + 1,
          `${starter.id}/${element.id}: needs ${actual.toFixed(1)}pt but reserves ${element.height}`
        )
      }
    }
  })

  it('keeps elements on the page and free of overlaps', () => {
    for (const starter of CONTRACT_STARTERS) {
      const template = starter.build()
      const pageCount = getDocumentPageCount(template)
      const flowing = template.elements.filter(
        (element) => element.kind === 'text' || element.kind === 'input' || element.kind === 'checkbox'
      )

      for (const element of template.elements) {
        const page = element.page ?? 0
        assert.ok(page < pageCount, `${starter.id}/${element.id} is past the last page`)
        const size = getDocumentPageSize(template, page)
        const bounds = getElementBounds(element)
        assert.ok(element.y + bounds.height <= size.height, `${starter.id}/${element.id} runs off the page`)
      }

      for (const a of flowing) {
        for (const b of flowing) {
          if (a === b || (a.page ?? 0) !== (b.page ?? 0)) continue
          const aBottom = a.y + (a.height || 0)
          const overlaps = a.y < b.y && aBottom > b.y
          assert.equal(overlaps, false, `${starter.id}: ${a.id} overlaps ${b.id}`)
        }
      }
    }
  })

  it('looks up starters by id', () => {
    assert.equal(getContractStarter('service-agreement')?.name, 'Service agreement')
    assert.equal(getContractStarter('nope'), null)
  })
})
