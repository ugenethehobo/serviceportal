import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatContractNumber,
  formatContractStatus,
  isSendableContractStatus,
  isSignableContractStatus,
  isVoidableContractStatus,
} from '@/lib/contracts'
import {
  normalizeUploadedDocumentRow,
  toGalleryDocument,
} from '@/lib/uploaded-documents'

describe('contracts', () => {
  it('formats contract numbers with date stamp and id suffix', () => {
    const number = formatContractNumber(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      '2026-07-02T12:00:00.000Z'
    )
    assert.match(number, /^CTR-20260702-[A-F0-9]{6}$/)
  })

  it('labels contract statuses for display', () => {
    assert.equal(formatContractStatus('ready_for_signing'), 'Ready for signing')
    assert.equal(formatContractStatus('void'), 'Void')
  })

  it('determines sendable and voidable statuses', () => {
    assert.equal(isSendableContractStatus('draft'), true)
    assert.equal(isSendableContractStatus('ready_for_signing'), false)
    assert.equal(isVoidableContractStatus('draft'), true)
    assert.equal(isVoidableContractStatus('signed'), false)
    assert.equal(isVoidableContractStatus('void'), false)
    assert.equal(isSignableContractStatus('ready_for_signing'), true)
    assert.equal(isSignableContractStatus('signed'), false)
  })
})

describe('uploaded documents contract mapping', () => {
  it('maps contract source rows into the Contracts folder with status', () => {
    const normalized = normalizeUploadedDocumentRow({
      id: 'doc-1',
      client_id: 'client-1',
      company_id: 'company-1',
      estimate_id: null,
      contract_id: 'contract-1',
      schedule_id: 'schedule-1',
      name: 'CTR-20260702-ABC123.pdf',
      file_name: null,
      storage_path: 'company/client/contracts/contract-1.pdf',
      file_type: 'application/pdf',
      source: 'contract',
      category: 'Contracts',
      file_size: 1024,
      notes: null,
      uploaded_by: null,
      created_at: '2026-07-02T12:00:00.000Z',
      contract: { status: 'ready_for_signing' },
    })

    const gallery = toGalleryDocument(normalized)
    assert.equal(gallery.displayCategory, 'Contracts')
    assert.equal(gallery.isSystemDocument, true)
    assert.equal(gallery.contractStatus, 'ready_for_signing')
  })
})