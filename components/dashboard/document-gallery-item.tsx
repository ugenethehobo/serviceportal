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
import { formatContractStatus } from '@/lib/contracts'
import {
  formatDocumentSize,
  getDocumentCategoryLabel,
  getDocumentDisplayName,
  isImageDocument,
  isPreviewableDocument,
  type GalleryDocument,
} from '@/lib/uploaded-documents'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Download, Eye, FileImage, FileSignature, FileText, Loader2, Trash2 } from 'lucide-react'

interface DocumentGalleryItemProps {
  document: GalleryDocument
  onView: (document: GalleryDocument) => void
  onDelete: (documentId: string) => void
  onDownload: (documentId: string) => void
  isDeleting: boolean
  canDelete: boolean
  variant?: 'staff' | 'portal'
}

export function DocumentGalleryItem({
  document,
  onView,
  onDelete,
  onDownload,
  isDeleting,
  canDelete,
  variant = 'staff',
}: DocumentGalleryItemProps) {
  const displayName = getDocumentDisplayName(document)
  const sizeLabel = formatDocumentSize(document.file_size)
  const previewable = isPreviewableDocument(document.file_type)
  const canSignContract =
    variant === 'portal' &&
    document.source === 'contract' &&
    document.contract_id &&
    document.contractStatus === 'ready_for_signing'

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
        <AttachmentTitle className="flex flex-wrap items-center gap-2">
          <span>{displayName}</span>
          {document.source === 'contract' && document.contractStatus ? (
            <Badge variant="secondary" className="font-normal">
              {formatContractStatus(document.contractStatus)}
            </Badge>
          ) : null}
        </AttachmentTitle>
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
        {canSignContract && (
          <Link href={`/portal/contracts/${document.contract_id}`}>
            <AttachmentAction aria-label="Review and sign contract">
              <FileSignature />
            </AttachmentAction>
          </Link>
        )}
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