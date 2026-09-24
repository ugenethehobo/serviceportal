import { isSignableContractStatus } from '@/lib/contracts'
import type { DocumentElement, DocumentTemplate } from '@/lib/document-template'

export { isSignableContractStatus }

export type ContractSigningInputField = {
  key: string
  label: string
  elementId: string
  required: boolean
  multiline: boolean
}

export type ContractSigningCheckboxField = {
  key: string
  label: string
  elementId: string
  required: boolean
}

export type ContractSigningRequirements = {
  requiresSignature: boolean
  requiresInitials: boolean
  inputFields: ContractSigningInputField[]
  checkboxFields: ContractSigningCheckboxField[]
}

/** Fields staff complete on a draft before it is sent (scope, price, dates, ...). */
export type ContractStaffField = ContractSigningInputField

const SIGNATURE_DATA_URL_RE = /^data:image\/png;base64,/
export const CONTRACT_FIELD_VALUE_MAX_LENGTH = 2000
const MULTILINE_MIN_HEIGHT = 40

function fieldKeyFor(element: DocumentElement) {
  return element.fieldKey || element.id
}

function toInputField(element: DocumentElement, fallbackLabel: string): ContractSigningInputField {
  return {
    key: fieldKeyFor(element),
    label: element.label?.trim() || fallbackLabel,
    elementId: element.id,
    required: element.required !== false,
    multiline: (element.height ?? 48) >= MULTILINE_MIN_HEIGHT,
  }
}

export function extractContractSigningRequirements(
  template: DocumentTemplate
): ContractSigningRequirements {
  const visible = template.elements.filter((element) => element.visible)
  let requiresSignature = false
  let requiresInitials = false
  const inputFields: ContractSigningInputField[] = []
  const checkboxFields: ContractSigningCheckboxField[] = []
  const seenKeys = new Set<string>()

  for (const element of visible) {
    if (element.kind === 'signature' || element.fieldKey === 'sign.client') {
      requiresSignature = true
    }
    if (element.kind === 'initial' || element.fieldKey === 'sign.client.initials') {
      requiresInitials = true
    }
    if (element.kind === 'input' && element.filledBy !== 'staff') {
      const field = toInputField(element, 'Response')
      if (seenKeys.has(field.key)) continue
      seenKeys.add(field.key)
      inputFields.push(field)
    }
    if (element.kind === 'checkbox') {
      const key = fieldKeyFor(element)
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      checkboxFields.push({
        key,
        label: element.label?.trim() || 'I agree',
        elementId: element.id,
        required: element.required !== false,
      })
    }
  }

  return { requiresSignature, requiresInitials, inputFields, checkboxFields }
}

export function extractContractStaffFields(template: DocumentTemplate): ContractStaffField[] {
  const fields: ContractStaffField[] = []
  const seenKeys = new Set<string>()
  for (const element of template.elements) {
    if (!element.visible || element.kind !== 'input' || element.filledBy !== 'staff') continue
    const field = toInputField(element, 'Details')
    if (seenKeys.has(field.key)) continue
    seenKeys.add(field.key)
    fields.push(field)
  }
  return fields
}

export function templateHasSigningElement(element: DocumentElement): boolean {
  return (
    element.visible &&
    (element.kind === 'signature' ||
      element.kind === 'initial' ||
      element.kind === 'checkbox' ||
      (element.kind === 'input' && element.filledBy !== 'staff') ||
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
    if (!value && field.required) {
      return { valid: false, error: `${field.label} is required` }
    }
    if (value.length > CONTRACT_FIELD_VALUE_MAX_LENGTH) {
      return {
        valid: false,
        error: `${field.label} must be ${CONTRACT_FIELD_VALUE_MAX_LENGTH} characters or fewer`,
      }
    }
  }

  for (const field of requirements.checkboxFields) {
    if (field.required && input.fieldValues[field.key] !== 'true') {
      return { valid: false, error: `Check "${field.label}" to continue` }
    }
  }

  return { valid: true }
}

/**
 * Merges a client's signing submission into the stored values. Only keys that belong to
 * client fields are accepted, so a crafted request can't overwrite staff-entered values
 * such as the price.
 */
export function mergeClientSigningValues(
  requirements: ContractSigningRequirements,
  existing: Record<string, string>,
  submitted: Record<string, string>
): Record<string, string> {
  const merged = { ...existing }
  for (const field of requirements.inputFields) {
    merged[field.key] = (submitted[field.key] ?? '').trim()
  }
  for (const field of requirements.checkboxFields) {
    merged[field.key] = submitted[field.key] === 'true' ? 'true' : ''
  }
  return merged
}

/** Keeps only staff field keys from an editor save, trimmed and length-limited. */
export function sanitizeStaffFieldValues(
  fields: ContractStaffField[],
  existing: Record<string, string>,
  submitted: Record<string, string>
): Record<string, string> {
  const merged = { ...existing }
  for (const field of fields) {
    if (!(field.key in submitted)) continue
    merged[field.key] = String(submitted[field.key] ?? '').slice(0, CONTRACT_FIELD_VALUE_MAX_LENGTH)
  }
  return merged
}

export function validateContractStaffFields(
  fields: ContractStaffField[],
  values: Record<string, string>
): { valid: true } | { valid: false; error: string } {
  for (const field of fields) {
    if (field.required && !values[field.key]?.trim()) {
      return { valid: false, error: `Fill in "${field.label}" before sending` }
    }
  }
  return { valid: true }
}
