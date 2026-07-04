import {
  DEFAULT_DOCUMENT_CATEGORY,
  SYSTEM_DOCUMENT_CATEGORY_ESTIMATES,
  SYSTEM_DOCUMENT_CATEGORY_INVOICES,
  SYSTEM_DOCUMENT_CATEGORY_ORDER,
} from '@/lib/document-categories'

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
  source: 'estimate' | 'upload' | 'invoice'
  category: string | null
  file_size: number | null
  notes: string | null
  uploaded_by: string | null
  created_at: string
}

export type GalleryDocument = UploadedDocument & {
  displayCategory: string
  isSystemDocument: boolean
}

export function toGalleryDocument(document: UploadedDocument): GalleryDocument {
  if (document.source === 'invoice') {
    return {
      ...document,
      displayCategory: SYSTEM_DOCUMENT_CATEGORY_INVOICES,
      isSystemDocument: true,
    }
  }

  if (document.source === 'estimate') {
    return {
      ...document,
      displayCategory: SYSTEM_DOCUMENT_CATEGORY_ESTIMATES,
      isSystemDocument: true,
    }
  }

  return {
    ...document,
    displayCategory: document.category?.trim() || DEFAULT_DOCUMENT_CATEGORY,
    isSystemDocument: false,
  }
}

export function toGalleryDocuments(documents: UploadedDocument[]) {
  return documents.map(toGalleryDocument)
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

export function isPdfDocument(fileType: string) {
  return fileType === 'application/pdf'
}

export function isPreviewableDocument(fileType: string) {
  return (
    isPdfDocument(fileType) ||
    isImageDocument(fileType) ||
    fileType === 'text/plain'
  )
}

export function getDocumentDisplayName(doc: UploadedDocument) {
  return doc.notes?.trim() || doc.file_name || doc.name
}

export function getDocumentCategoryLabel(doc: Pick<GalleryDocument, 'displayCategory'>) {
  return doc.displayCategory
}

export function deriveUploadCategorySuggestions(documents: GalleryDocument[]) {
  const seen = new Set<string>()
  const categories: string[] = []

  for (const document of documents) {
    if (document.isSystemDocument) continue
    const label = document.displayCategory
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

export function buildDocumentCategoryTabs(documents: GalleryDocument[]) {
  const uploadCategories = deriveUploadCategorySuggestions(documents)
  const reservedKeys = new Set(
    SYSTEM_DOCUMENT_CATEGORY_ORDER.map((category) => category.toLowerCase())
  )

  const tabs: string[] = [...SYSTEM_DOCUMENT_CATEGORY_ORDER]

  for (const category of uploadCategories) {
    if (reservedKeys.has(category.toLowerCase())) continue
    tabs.push(category)
  }

  return tabs
}

export function groupDocumentsByCategory(
  documents: GalleryDocument[],
  categories: string[]
) {
  const groups = new Map<string, GalleryDocument[]>()

  for (const document of documents) {
    const category = document.displayCategory
    const existing = groups.get(category) || []
    existing.push(document)
    groups.set(category, existing)
  }

  const ordered: Array<{ key: string; label: string; documents: GalleryDocument[] }> = []
  const seen = new Set<string>()

  for (const category of categories) {
    const items = groups.get(category) || []
    ordered.push({ key: category, label: category, documents: items })
    seen.add(category.toLowerCase())
    groups.delete(category)
  }

  for (const [category, items] of groups.entries()) {
    if (!seen.has(category.toLowerCase())) {
      ordered.push({ key: category, label: category, documents: items })
    }
  }

  return ordered
}

export function countDocumentsInCategory(documents: GalleryDocument[], category: string) {
  return documents.filter((document) => document.displayCategory === category).length
}