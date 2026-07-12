import { isSignableContractStatus } from '@/lib/contracts'
import type { DocumentElement, DocumentTemplate } from '@/lib/document-template'

export { isSignableContractStatus }

export type ContractSigningInputField = {
  key: string
  label: string
  elementId: string
}

export type ContractSigningRequirements = {
  requiresSignature: boolean
  requiresInitials: boolean
  inputFields: ContractSigningInputField[]
}

const SIGNATURE_DATA_URL_RE = /^data:image\/png;base64,/

export function extractContractSigningRequirements(
  template: DocumentTemplate
): ContractSigningRequirements {
  const visible = template.elements.filter((element) => element.visible)
  let requiresSignature = false
  let requiresInitials = false
  const inputFields: ContractSigningInputField[] = []

  for (const element of visible) {
    if (element.kind === 'signature' || element.fieldKey === 'sign.client') {
      requiresSignature = true
    }
    if (element.kind === 'initial' || element.fieldKey === 'sign.client.initials') {
      requiresInitials = true
    }
    if (element.kind === 'input') {
      const key = element.fieldKey || element.id
      inputFields.push({
        key,
        label: element.label?.trim() || 'Response',
        elementId: element.id,
      })
    }
  }

  return { requiresSignature, requiresInitials, inputFields }
}

export function templateHasSigningElement(element: DocumentElement): boolean {
  return (
    element.visible &&
    (element.kind === 'signature' ||
      element.kind === 'initial' ||
      element.kind === 'input' ||
      element.fieldKey === 'sign.client' ||
      element.fieldKey === 'sign.client.initials')
  )
}

export function parseSignatureDataUrl(dataUrl: string): Uint8Array | null {
  if (!SIGNATURE_DATA_URL_RE.test(dataUrl)) return null
  const base64 = dataUrl.replace(SIGNATURE_DATA_URL_RE, '')
  try {
    const binary = Buffer.from(base64, 'base64')
    if (binary.length < 80 || binary.length > 750_000) return null
    return new Uint8Array(binary)
  } catch {
    return null
  }
}

export function validateContractSigningSubmission(
  requirements: ContractSigningRequirements,
  input: {
    signedName: string
    fieldValues: Record<string, string>
    signatureDataUrl?: string | null
    initialsDataUrl?: string | null
  }
): { valid: true } | { valid: false; error: string } {
  const signedName = input.signedName.trim()
  if (!signedName) {
    return { valid: false, error: 'Enter your full legal name' }
  }
  if (signedName.length > 120) {
    return { valid: false, error: 'Name must be 120 characters or fewer' }
  }

  if (requirements.requiresSignature) {
    if (!input.signatureDataUrl || !parseSignatureDataUrl(input.signatureDataUrl)) {
      return { valid: false, error: 'Draw your signature before submitting' }
    }
  }

  if (requirements.requiresInitials) {
    if (!input.initialsDataUrl || !parseSignatureDataUrl(input.initialsDataUrl)) {
      return { valid: false, error: 'Draw your initials before submitting' }
    }
  }

  for (const field of requirements.inputFields) {
    const value = input.fieldValues[field.key]?.trim() || ''
    if (!value) {
      return { valid: false, error: `${field.label} is required` }
    }
    if (value.length > 500) {
      return { valid: false, error: `${field.label} must be 500 characters or fewer` }
    }
  }

  return { valid: true }
}