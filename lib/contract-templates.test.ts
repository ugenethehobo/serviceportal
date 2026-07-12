import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildNewContractTemplatePayload,
  normalizeContractTemplateRecord,
} from '@/lib/contract-templates'
import { normalizeDocumentTemplate } from '@/lib/document-template'

describe('contract templates', () => {
  it('builds a default catch-all contract template payload', () => {
    const payload = buildNewContractTemplatePayload()
    assert.equal(payload.service_package_id, null)
    assert.equal(payload.template.version, 2)
    assert.ok(payload.template.elements.some((element) => element.kind === 'signature'))
    assert.ok(payload.template.elements.some((element) => element.kind === 'input'))
  })

  it('normalizes stored contract template records', () => {
    const record = normalizeContractTemplateRecord({
      id: 'template-1',
      company_id: 'company-1',
      service_package_id: null,
      name: 'Default contract',
      template: normalizeDocumentTemplate(null, 'contract'),
      active: true,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-02T00:00:00.000Z',
    })

    assert.equal(record.template.elements.length > 0, true)
    assert.equal(record.active, true)
  })
})