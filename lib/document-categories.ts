export type DocumentCategory = string

export const DEFAULT_DOCUMENT_CATEGORY = 'General'

export const SYSTEM_DOCUMENT_CATEGORY_INVOICES = 'Invoices'
export const SYSTEM_DOCUMENT_CATEGORY_ESTIMATES = 'Estimates'
export const SYSTEM_DOCUMENT_CATEGORY_CONTRACTS = 'Contracts'

const RESERVED_UPLOAD_CATEGORY_KEYS = new Set([
  SYSTEM_DOCUMENT_CATEGORY_INVOICES.toLowerCase(),
  SYSTEM_DOCUMENT_CATEGORY_ESTIMATES.toLowerCase(),
  SYSTEM_DOCUMENT_CATEGORY_CONTRACTS.toLowerCase(),
])

export const SYSTEM_DOCUMENT_CATEGORY_ORDER = [
  SYSTEM_DOCUMENT_CATEGORY_INVOICES,
  SYSTEM_DOCUMENT_CATEGORY_ESTIMATES,
  SYSTEM_DOCUMENT_CATEGORY_CONTRACTS,
] as const

export function isReservedUploadCategory(category: string) {
  return RESERVED_UPLOAD_CATEGORY_KEYS.has(category.trim().toLowerCase())
}

export function resolveUploadCategory(
  category: string | null | undefined
): { valid: true; category: DocumentCategory } | { valid: false; error: string } {
  const resolved = category?.trim() || DEFAULT_DOCUMENT_CATEGORY

  if (isReservedUploadCategory(resolved)) {
    return {
      valid: false,
      error: `${resolved} is reserved for auto-generated PDFs. Choose another category.`,
    }
  }

  if (resolved.length > 40) {
    return { valid: false, error: 'Category must be 40 characters or fewer' }
  }

  return { valid: true, category: resolved }
}

export function normalizeDocumentCategories(input: unknown): DocumentCategory[] {
  if (!Array.isArray(input)) return []

  const seen = new Set<string>()
  const categories: DocumentCategory[] = []

  for (const entry of input) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    categories.push(trimmed)
  }

  return categories
}

export function validateDocumentCategories(
  categories: DocumentCategory[]
): { valid: true } | { valid: false; error: string } {
  if (categories.length > 30) {
    return { valid: false, error: 'Use 30 categories or fewer' }
  }

  for (const category of categories) {
    if (!category.trim()) {
      return { valid: false, error: 'Category names cannot be empty' }
    }
    if (category.length > 40) {
      return { valid: false, error: 'Each category must be 40 characters or fewer' }
    }
  }

  return { valid: true }
}

export function normalizeDocumentCategory(
  category: string | null | undefined,
  available: DocumentCategory[]
): DocumentCategory | null {
  const trimmed = category?.trim()
  if (!trimmed) return null

  const match = available.find(
    (entry) => entry.toLowerCase() === trimmed.toLowerCase()
  )
  return match ?? null
}