import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractContractSigningRequirements,
  extractContractStaffFields,
  mergeClientSigningValues,
  parseSignatureDataUrl,
  sanitizeStaffFieldValues,
  validateContractSigningSubmission,
  validateContractStaffFields,
} from '@/lib/contract-signing'
import { isSignableContractStatus } from '@/lib/contracts'
import { DEFAULT_CONTRACT_DOCUMENT_TEMPLATE, normalizeDocumentTemplate } from '@/lib/document-template'

describe('contract signing helpers', () => {
  it('detects signable contract status', () => {
    assert.equal(isSignableContractStatus('ready_for_signing'), true)
    assert.equal(isSignableContractStatus('signed'), false)
  })

  it('extracts signing requirements from the default contract template', () => {
    const requirements = extractContractSigningRequirements(DEFAULT_CONTRACT_DOCUMENT_TEMPLATE)
    assert.equal(requirements.requiresSignature, true)
    assert.equal(requirements.requiresInitials, true)
    assert.equal(requirements.inputFields.length, 1)
    assert.equal(requirements.inputFields[0]?.key, 'input.notes')
  })

  it('parses png data urls for signature upload', () => {
    const bytes = Buffer.alloc(120, 1)
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`
    const parsed = parseSignatureDataUrl(dataUrl)
    assert.ok(parsed)
    assert.equal(parsed?.length, bytes.length)
  })

  it('validates signing submission requirements', () => {
    const requirements = extractContractSigningRequirements(DEFAULT_CONTRACT_DOCUMENT_TEMPLATE)
    const bytes = Buffer.alloc(120, 2)
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`

    const invalid = validateContractSigningSubmission(requirements, {
      signedName: '',
      fieldValues: {},
      signatureDataUrl: dataUrl,
      initialsDataUrl: dataUrl,
    })
    assert.equal(invalid.valid, false)

    const valid = validateContractSigningSubmission(requirements, {
      signedName: 'Jamie Client',
      fieldValues: { 'input.notes': 'Looks good' },
      signatureDataUrl: dataUrl,
      initialsDataUrl: dataUrl,
    })
    assert.equal(valid.valid, true)
  })
})
describe('contract signing v2 fields', () => {
  const template = normalizeDocumentTemplate(
    {
      version: 2,
      page: { width: 612, height: 792 },
      elements: [
        { id: 'sig', kind: 'signature', fieldKey: 'sign.client', x: 50, y: 600, visible: true },
        { id: 'price', kind: 'input', fieldKey: 'staff.price', filledBy: 'staff', label: 'Price', x: 50, y: 100, height: 20, visible: true },
        { id: 'notes', kind: 'input', fieldKey: 'input.notes', label: 'Notes', required: false, x: 50, y: 200, height: 60, visible: true },
        { id: 'gate', kind: 'input', fieldKey: 'input.gate', label: 'Gate code', x: 50, y: 300, height: 18, visible: true },
        { id: 'ack', kind: 'checkbox', fieldKey: 'check.ack', label: 'I agree', x: 50, y: 400, visible: true },
      ],
    },
    'contract'
  )
  const signature = `data:image/png;base64,${Buffer.alloc(120, 3).toString('base64')}`

  it('separates client requirements from team fields', () => {
    const requirements = extractContractSigningRequirements(template)
    assert.deepEqual(
      requirements.inputFields.map((field) => [field.key, field.required, field.multiline]),
      [
        ['input.notes', false, true],
        ['input.gate', true, false],
      ]
    )
    assert.deepEqual(requirements.checkboxFields.map((field) => field.key), ['check.ack'])
    assert.deepEqual(extractContractStaffFields(template).map((field) => field.key), ['staff.price'])
  })

  it('requires checked checkboxes and allows optional inputs to be blank', () => {
    const requirements = extractContractSigningRequirements(template)
    const base = { signedName: 'Jamie', signatureDataUrl: signature }

    const unchecked = validateContractSigningSubmission(requirements, {
      ...base,
      fieldValues: { 'input.gate': '1234' },
    })
    assert.equal(unchecked.valid, false)

    const ok = validateContractSigningSubmission(requirements, {
      ...base,
      fieldValues: { 'input.gate': '1234', 'check.ack': 'true' },
    })
    assert.equal(ok.valid, true)
  })

  it('never lets a client submission overwrite team values', () => {
    const requirements = extractContractSigningRequirements(template)
    const merged = mergeClientSigningValues(
      requirements,
      { 'staff.price': '$500' },
      { 'staff.price': '$1', 'input.gate': ' 1234 ', 'check.ack': 'true', 'evil.key': 'x' }
    )
    assert.deepEqual(merged, {
      'staff.price': '$500',
      'input.notes': '',
      'input.gate': '1234',
      'check.ack': 'true',
    })
  })

  it('only saves team keys from the editor and validates them before sending', () => {
    const fields = extractContractStaffFields(template)
    const saved = sanitizeStaffFieldValues(fields, { 'input.gate': 'client' }, {
      'staff.price': '$750',
      'input.gate': 'hacked',
    })
    assert.deepEqual(saved, { 'input.gate': 'client', 'staff.price': '$750' })
    assert.equal(validateContractStaffFields(fields, {}).valid, false)
    assert.equal(validateContractStaffFields(fields, saved).valid, true)
  })
})
