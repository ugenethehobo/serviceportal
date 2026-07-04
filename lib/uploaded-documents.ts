import { DEFAULT_DOCUMENT_CATEGORY } from '@/lib/document-categories'

export const CLIENT_DOCUMENTS_BUCKET = 'client-documents'

export const UPLOADED_DOCUMENT_ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const

export const UPLOADED_DOCUMENT_ACCEPT_ATTRIBUTE =
  UPLOADED_DOCUMENT_ACCEPTED_TYPES.join(',')

export const UPLOADED_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

export type UploadedDocument = {
  id: string
  client_id: string
  company_id: string
  estimate_id: string | null
  schedule_id: string | null
  name: string
  file_name: string | null
  storage_path: string
  file_type: string
  source: 'estimate' | 'upload'
  category: string | null
  file_size: number | null
  notes: string | null
  uploaded_by: string | null
  created_at: string
}

export function formatDocumentSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isImageDocument(fileType: string) {
  return fileType.startsWith('image/')
}

export function getDocumentDisplayName(doc: UploadedDocument) {
  return doc.notes?.trim() || doc.file_name || doc.name
}

export function getDocumentCategoryLabel(doc: UploadedDocument) {
  return doc.category?.trim() || DEFAULT_DOCUMENT_CATEGORY
}

export function deriveDocumentCategories(documents: UploadedDocument[]) {
  const seen = new Set<string>()
  const categories: string[] = []

  for (const document of documents) {
    const label = getDocumentCategoryLabel(document)
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    categories.push(label)
  }

  const generalIndex = categories.findIndex(
    (category) => category.toLowerCase() === DEFAULT_DOCUMENT_CATEGORY.toLowerCase()
  )
  if (generalIndex > 0) {
    const [general] = categories.splice(generalIndex, 1)
    categories.unshift(general)
  }

  return categories
}

export function groupDocumentsByCategory(
  documents: UploadedDocument[],
  categories: string[]
) {
  const groups = new Map<string, UploadedDocument[]>()

  for (const document of documents) {
    const category = getDocumentCategoryLabel(document)
    const existing = groups.get(category) || []
    existing.push(document)
    groups.set(category, existing)
  }

  const ordered: Array<{ key: string; label: string; documents: UploadedDocument[] }> = []
  const seen = new Set<string>()

  for (const category of categories) {
    const items = groups.get(category)
    if (!items?.length) continue
    ordered.push({ key: category, label: category, documents: items })
    seen.add(category.toLowerCase())
    groups.delete(category)
  }

  for (const [category, items] of groups.entries()) {
    if (items.length > 0 && !seen.has(category.toLowerCase())) {
      ordered.push({ key: category, label: category, documents: items })
    }
  }

  return ordered
}