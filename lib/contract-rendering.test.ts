import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  createContractElement,
  duplicateContractElement,
  getContractFieldPresets,
} from '@/lib/contract-field-presets'
import { buildPdfContractTemplate, pickDefaultContractTemplate, normalizeContractTemplateRecord } from '@/lib/contract-templates'
import { canSendContractReminder, isContractVisibleToClient } from '@/lib/contracts'
import { getDocumentPageCount, normalizeDocumentTemplate } from '@/lib/document-template'
import { interpolateMergeTags } from '@/lib/document-template-fields'
import {
  renderDocumentPdf,
  resolveMergeFieldValue,
  toEncodableText,
  wrapTextToWidth,
} from '@/lib/document-template-renderer'
import { SAMPLE_CONTRACT_RENDER_DATA } from '@/lib/document-template-sample'
import { filterClientVisibleDocuments } from '@/lib/uploaded-documents'

async function helvetica() {
  const pdf = await PDFDocument.create()
  return pdf.embedFont(StandardFonts.Helvetica)
}

describe('contract template normalization', () => {
  it('lets staff delete default contract elements', () => {
    const template = normalizeDocumentTemplate(
      { version: 2, page: { width: 612, height: 792 }, elements: [] },
      'contract'
    )
    assert.equal(template.elements.length, 0)
  })

  it('keeps invoices backfilled with their default elements', () => {
    const template = normalizeDocumentTemplate(
      { version: 2, page: { width: 612, height: 792 }, elements: [] },
      'invoice'
    )
    assert.ok(template.elements.length > 5)
  })

  it('clamps pages to the uploaded PDF and elements to existing pages', () => {
    const template = normalizeDocumentTemplate(
      {
        version: 2,
        page: { width: 612, height: 792 },
        pages: [{ width: 612, height: 792 }],
        background: { kind: 'pdf', storagePath: 'c1/x.pdf', fileName: 'x.pdf', pageCount: 3 },
        elements: [{ id: 'a', kind: 'signature', x: 1, y: 1, page: 9, visible: true }],
      },
      'contract'
    )
    assert.equal(getDocumentPageCount(template), 3)
    assert.equal(template.elements[0].page, 2)
  })

  it('drops background paths that try to escape their folder', () => {
    const template = normalizeDocumentTemplate(
      {
        version: 2,
        page: { width: 612, height: 792 },
        background: { kind: 'pdf', storagePath: 'c1/../c2/x.pdf', fileName: 'x.pdf', pageCount: 1 },
        elements: [],
      },
      'contract'
    )
    assert.equal(template.background, undefined)
  })
})

describe('contract text helpers', () => {
  it('interpolates known merge tags and leaves unknown ones visible', () => {
    const text = interpolateMergeTags('Hi {{client.name}}, {{ company.name }}! {{nope.tag}}', (key) =>
      resolveMergeFieldValue(SAMPLE_CONTRACT_RENDER_DATA as never, key)
    )
    assert.equal(text, 'Hi Client Name, Company Name! {{nope.tag}}')
  })

  it('replaces characters standard PDF fonts cannot draw', async () => {
    const font = await helvetica()
    assert.equal(toEncodableText(font, 'Café “quotes” — ok'), 'Café “quotes” — ok')
    assert.equal(toEncodableText(font, 'Done ✓ 🚀\tnext'), 'Done X ? next')
  })

  it('wraps by measured width, keeps blank lines, and breaks long words', async () => {
    const font = await helvetica()
    const lines = wrapTextToWidth('Short line\n\nsupercalifragilisticexpialidocious', font, 10, 60)
    assert.equal(lines[0], 'Short line')
    assert.equal(lines[1], '')
    assert.ok(lines.length > 3)
    for (const line of lines) assert.ok(font.widthOfTextAtSize(line, 10) <= 60)
  })
})

describe('contract PDF rendering', () => {
  it('draws fields onto an uploaded PDF and appends a signature certificate', async () => {
    const base = await PDFDocument.create()
    base.addPage([612, 792])
    base.addPage([792, 612])
    const baseBytes = await base.save()

    const template = buildPdfContractTemplate({
      storagePath: 'company/contract-templates/t/x.pdf',
      fileName: 'x.pdf',
      pageSizes: [
        { width: 612, height: 792 },
        { width: 792, height: 612 },
      ],
    })
    template.elements.push(
      {
        id: 'price',
        kind: 'input',
        fieldKey: 'staff.price',
        filledBy: 'staff',
        appearance: 'overlay',
        x: 100,
        y: 100,
        width: 120,
        height: 16,
        visible: true,
      },
      { id: 'agree', kind: 'checkbox', fieldKey: 'check.agree', x: 100, y: 200, page: 1, visible: true }
    )

    const bytes = await renderDocumentPdf({
      ...SAMPLE_CONTRACT_RENDER_DATA,
      template,
      basePdfBytes: baseBytes,
      contract: { serviceName: null, signedDate: 'January 2, 2026', signedName: 'Jamie' },
      fieldValues: { 'staff.price': '$1,200 🙂', 'check.agree': 'true' },
      auditTrail: { title: 'Signature certificate', rows: [{ label: 'Signer', value: 'Jamie' }] },
    })

    const output = await PDFDocument.load(bytes)
    assert.equal(output.getPageCount(), 3)
    assert.deepEqual(output.getPage(1).getSize(), { width: 792, height: 612 })
  })

  it('renders multi-page builder contracts', async () => {
    const template = normalizeDocumentTemplate(
      {
        version: 2,
        page: { width: 612, height: 792 },
        pages: [
          { width: 612, height: 792 },
          { width: 612, height: 792 },
        ],
        elements: [
          { id: 't', kind: 'text', text: 'Page two {{client.name}}', x: 50, y: 50, page: 1, visible: true },
        ],
      },
      'contract'
    )
    const bytes = await renderDocumentPdf({ ...SAMPLE_CONTRACT_RENDER_DATA, template })
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2)
  })
})

describe('contract field presets', () => {
  it('centers dropped fields and keeps them on the page', () => {
    const element = createContractElement('signature', {
      x: 5,
      y: 5000,
      page: 1,
      pageSize: { width: 612, height: 792 },
      pdfMode: true,
    })
    assert.ok(element)
    assert.equal(element!.appearance, 'overlay')
    assert.equal(element!.page, 1)
    assert.equal(element!.x, 0)
    assert.equal(element!.y, 792 - (element!.height ?? 0))
  })

  it('gives client and team inputs unique keys, including duplicates', () => {
    const size = { width: 612, height: 792 }
    const a = createContractElement('team-text', { x: 100, y: 100, page: 0, pageSize: size, pdfMode: false })!
    const b = duplicateContractElement(a)
    assert.equal(a.filledBy, 'staff')
    assert.ok(a.fieldKey?.startsWith('staff.'))
    assert.ok(b.fieldKey?.startsWith('staff.'))
    assert.notEqual(a.fieldKey, b.fieldKey)
    assert.equal(a.page, undefined)
  })

  it('hides builder-only tools on uploaded PDFs', () => {
    assert.ok(getContractFieldPresets(false).some((preset) => preset.id === 'divider'))
    assert.ok(!getContractFieldPresets(true).some((preset) => preset.id === 'divider'))
  })
})

describe('contract lifecycle helpers', () => {
  it('keeps draft contracts out of the client portal', () => {
    assert.equal(isContractVisibleToClient('draft'), false)
    assert.equal(isContractVisibleToClient('ready_for_signing'), true)
    const docs = filterClientVisibleDocuments([
      { id: '1', source: 'contract', contract_status: 'draft' as const },
      { id: '2', source: 'contract', contract_status: 'signed' as const },
      { id: '3', source: 'upload', contract_status: null },
    ])
    assert.deepEqual(docs.map((doc) => doc.id), ['2', '3'])
  })

  it('rate limits reminders', () => {
    const now = new Date('2026-01-01T12:00:00Z')
    assert.equal(canSendContractReminder('ready_for_signing', null, now), true)
    assert.equal(canSendContractReminder('ready_for_signing', '2026-01-01T11:55:00Z', now), false)
    assert.equal(canSendContractReminder('ready_for_signing', '2026-01-01T11:40:00Z', now), true)
    assert.equal(canSendContractReminder('signed', null, now), false)
  })

  it('picks the flagged default, falling back to the v1 catch-all', () => {
    const record = (id: string, extra: Record<string, unknown>) =>
      normalizeContractTemplateRecord({ id, company_id: 'c', created_at: `2026-01-0${id}T00:00:00Z`, ...extra })
    assert.equal(
      pickDefaultContractTemplate([record('1', {}), record('2', { is_default: true })])?.id,
      '2'
    )
    assert.equal(
      pickDefaultContractTemplate([record('2', { service_package_id: 'p' }), record('1', {})])?.id,
      '1'
    )
  })
})
