'use client'

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/components/ui/attachment'
import {
  formatDocumentSize,
  getDocumentCategoryLabel,
  getDocumentDisplayName,
  isImageDocument,
  isPreviewableDocument,
  type GalleryDocument,
} from '@/lib/uploaded-documents'
import { Download, Eye, FileImage, FileText, Loader2, Trash2 } from 'lucide-react'

interface DocumentGalleryItemProps {
  document: GalleryDocument
  onView: (document: GalleryDocument) => void
  onDelete: (documentId: string) => void
  onDownload: (documentId: string) => void
  isDeleting: boolean
  canDelete: boolean
}

export function DocumentGalleryItem({
  document,
  onView,
  onDelete,
  onDownload,
  isDeleting,
  canDelete,
}: DocumentGalleryItemProps) {
  const displayName = getDocumentDisplayName(document)
  const sizeLabel = formatDocumentSize(document.file_size)
  const previewable = isPreviewableDocument(document.file_type)

  return (
    <Attachment className="min-w-52 cursor-pointer">
      <AttachmentTrigger
        aria-label={`View ${displayName}`}
        onClick={() => onView(document)}
      />
      <AttachmentMedia variant={isImageDocument(document.file_type) ? 'image' : 'icon'}>
        {isImageDocument(document.file_type) ? <FileImage /> : <FileText />}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{displayName}</AttachmentTitle>
        <AttachmentDescription>
          {getDocumentCategoryLabel(document)}
          {sizeLabel ? ` · ${sizeLabel}` : ''}
        </AttachmentDescription>
        <AttachmentDescription>
          {new Date(document.created_at).toLocaleString()}
          {previewable ? ' · Click to preview' : ''}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        {previewable && (
          <AttachmentAction
            aria-label="View document"
            onClick={() => onView(document)}
          >
            <Eye />
          </AttachmentAction>
        )}
        <AttachmentAction
          aria-label="Download document"
          onClick={() => onDownload(document.id)}
        >
          <Download />
        </AttachmentAction>
        {canDelete && (
          <AttachmentAction
            aria-label="Delete document"
            onClick={() => onDelete(document.id)}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </AttachmentAction>
        )}
      </AttachmentActions>
    </Attachment>
  )
}