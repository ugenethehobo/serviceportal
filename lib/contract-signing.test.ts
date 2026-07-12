import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractContractSigningRequirements,
  parseSignatureDataUrl,
  validateContractSigningSubmission,
} from '@/lib/contract-signing'
import { isSignableContractStatus } from '@/lib/contracts'
import { DEFAULT_CONTRACT_DOCUMENT_TEMPLATE } from '@/lib/document-template'

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