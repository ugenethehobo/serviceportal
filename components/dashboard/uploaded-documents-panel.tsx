'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteUploadedDocumentAction,
  getUploadedDocumentsAction,
  uploadUploadedDocumentAction,
} from '@/app/action'
import { getPortalUploadedDocumentsAction } from '@/app/portal/actions'
import { DocumentGalleryItem } from '@/components/dashboard/document-gallery-item'
import { DocumentViewerDialog } from '@/components/dashboard/document-viewer-dialog'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DEFAULT_DOCUMENT_CATEGORY,
  SYSTEM_DOCUMENT_CATEGORY_ORDER,
} from '@/lib/document-categories'
import {
  buildDocumentCategoryTabs,
  groupDocumentsByCategory,
  toGalleryDocuments,
  UPLOADED_DOCUMENT_ACCEPT_ATTRIBUTE,
  type GalleryDocument,
  type UploadedDocument,
} from '@/lib/uploaded-documents'
import { toast } from 'sonner'
import {
  Download,
  FileImage,
  FileText,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

interface UploadedDocumentsPanelProps {
  clientId: string
  scheduleId?: string | null
  variant?: 'staff' | 'portal'
  refreshKey?: number
  title?: string
  description?: string
}

type PendingUpload = {
  id: string
  file: File
  state: 'uploading' | 'error'
  error?: string
}

export function UploadedDocumentsPanel({
  clientId,
  scheduleId = null,
  variant = 'staff',
  refreshKey = 0,
  title,
  description,
}: UploadedDocumentsPanelProps) {
  const [documents, setDocuments] = useState<GalleryDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [viewerDocument, setViewerDocument] = useState<GalleryDocument | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadCategory, setUploadCategory] = useState('')
  const [uploadNotes, setUploadNotes] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canUpload = variant === 'staff'

  const fetchDocuments = useCallback(async () => {
    const documentsResult =
      variant === 'portal'
        ? await getPortalUploadedDocumentsAction()
        : await getUploadedDocumentsAction(clientId, scheduleId)

    if (documentsResult.success) {
      setDocuments(toGalleryDocuments(documentsResult.documents))
    } else {
      toast.error(documentsResult.error || 'Failed to load documents')
    }

    setIsLoading(false)
  }, [clientId, scheduleId, variant])

  useEffect(() => {
    setIsLoading(true)
    fetchDocuments()
  }, [fetchDocuments, refreshKey])

  const categoryTabs = useMemo(() => buildDocumentCategoryTabs(documents), [documents])

  const groupedDocuments = useMemo(
    () => groupDocumentsByCategory(documents, categoryTabs),
    [documents, categoryTabs]
  )

  const categorySuggestions = useMemo(() => {
    const reserved = new Set<string>(SYSTEM_DOCUMENT_CATEGORY_ORDER)
    return categoryTabs.filter((category) => !reserved.has(category))
  }, [categoryTabs])

  const resetUploadModal = () => {
    setSelectedFiles([])
    setUploadCategory('')
    setUploadNotes('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const closeUploadModal = () => {
    setUploadModalOpen(false)
    resetUploadModal()
  }

  const uploadFile = async (file: File, category: string, notes: string, pendingId: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (notes.trim()) {
      formData.append('notes', notes.trim())
    }
    formData.append('category', category)

    const result = await uploadUploadedDocumentAction(clientId, formData, scheduleId)

    if (result.success) {
      setDocuments((current) => [toGalleryDocuments([result.document])[0], ...current])
      setPendingUploads((current) => current.filter((entry) => entry.id !== pendingId))
      toast.success('Document uploaded')
    } else {
      setPendingUploads((current) =>
        current.map((entry) =>
          entry.id === pendingId
            ? { ...entry, state: 'error', error: result.error || 'Upload failed' }
            : entry
        )
      )
      toast.error(result.error || 'Failed to upload document')
    }
  }

  const handleConfirmUpload = async () => {
    if (selectedFiles.length === 0) return

    const category = uploadCategory.trim() || DEFAULT_DOCUMENT_CATEGORY
    if (category.length > 40) {
      toast.error('Category must be 40 characters or fewer')
      return
    }

    const newPending = selectedFiles.map((file) => ({
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`,
      file,
      state: 'uploading' as const,
    }))

    setPendingUploads((current) => [...newPending, ...current])
    closeUploadModal()

    for (const pending of newPending) {
      await uploadFile(pending.file, category, uploadNotes, pending.id)
    }
  }

  const handleFilesSelected = (fileList: FileList | null) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return

    setSelectedFiles(files)
    setUploadCategory('')
    setUploadNotes('')
    setUploadModalOpen(true)
  }

  const removePendingUpload = (pendingId: string) => {
    setPendingUploads((current) => current.filter((item) => item.id !== pendingId))
  }

  const handleDelete = async (documentId: string) => {
    setDeletingId(documentId)
    const result = await deleteUploadedDocumentAction(documentId, clientId, scheduleId)
    if (result.success) {
      setDocuments((current) => current.filter((document) => document.id !== documentId))
      toast.success('Document deleted')
    } else {
      toast.error(result.error || 'Failed to delete document')
    }
    setDeletingId(null)
  }

  const handleDownload = (documentId: string) => {
    window.open(`/api/documents/${documentId}/download`, '_blank')
  }

  const isUploading = pendingUploads.some((entry) => entry.state === 'uploading')

  const defaultTitle = 'Documents'
  const defaultDescription = scheduleId
    ? 'All files for this job. Invoices appear under Invoices when billing has line items.'
    : variant === 'portal'
      ? 'Invoices, estimates, and other files from your service provider.'
      : 'All client files in one place. Invoices and estimates are generated automatically.'

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    )
  }

  const renderDocumentStack = (items: GalleryDocument[]) => {
    if (items.length === 0) {
      return (
        <div className="flex items-center justify-center border border-dashed rounded-lg py-12 text-center">
          <p className="text-sm text-muted-foreground">No documents in this category yet.</p>
        </div>
      )
    }

    return (
      <AttachmentGroup>
        {items.map((document) => (
          <DocumentGalleryItem
            key={document.id}
            document={document}
            onView={setViewerDocument}
            onDelete={handleDelete}
            onDownload={handleDownload}
            isDeleting={deletingId === document.id}
            canDelete={canUpload && !document.isSystemDocument}
          />
        ))}
      </AttachmentGroup>
    )
  }

  return (
    <div className="flex flex-col gap-5 flex-1 min-h-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold tracking-tight">{title || defaultTitle}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {description || defaultDescription}
          </p>
        </div>

        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={UPLOADED_DOCUMENT_ACCEPT_ATTRIBUTE}
              multiple
              className="hidden"
              onChange={(event) => handleFilesSelected(event.target.files)}
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="size-4" />
              {isUploading ? 'Uploading…' : 'Upload files'}
            </Button>
          </>
        )}
      </div>

      {canUpload && (
        <Dialog
          open={uploadModalOpen}
          onOpenChange={(open) => {
            if (!open) closeUploadModal()
            else setUploadModalOpen(true)
          }}
        >
          <DialogContent className="!max-w-md">
            <DialogHeader>
              <DialogTitle>Upload documents</DialogTitle>
              <DialogDescription>
                Choose a category for {selectedFiles.length === 1 ? 'this file' : 'these files'}.
                Leave blank to use {DEFAULT_DOCUMENT_CATEGORY}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {selectedFiles.length > 0 && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} selected
                  </p>
                  <ul className="space-y-1 text-sm">
                    {selectedFiles.map((file) => (
                      <li key={`${file.name}-${file.size}`} className="truncate">
                        {file.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="upload-category">Category</Label>
                <Input
                  id="upload-category"
                  list="document-category-suggestions"
                  value={uploadCategory}
                  onChange={(event) => setUploadCategory(event.target.value)}
                  placeholder={DEFAULT_DOCUMENT_CATEGORY}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleConfirmUpload()
                    }
                  }}
                />
                {categorySuggestions.length > 0 && (
                  <datalist id="document-category-suggestions">
                    {categorySuggestions.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                )}
                <p className="text-xs text-muted-foreground">
                  Type any category name. Empty defaults to {DEFAULT_DOCUMENT_CATEGORY}. Invoices
                  and Estimates are reserved for auto-generated PDFs.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="upload-notes">Label (optional)</Label>
                <Input
                  id="upload-notes"
                  value={uploadNotes}
                  onChange={(event) => setUploadNotes(event.target.value)}
                  placeholder="Friendly name for these files"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeUploadModal}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirmUpload()}
                disabled={selectedFiles.length === 0}
              >
                Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {pendingUploads.length > 0 && (
        <AttachmentGroup>
          {pendingUploads.map((pending) => (
            <Attachment
              key={pending.id}
              state={pending.state === 'error' ? 'error' : 'uploading'}
              className="min-w-48"
            >
              <AttachmentMedia variant="icon">
                <FileText />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{pending.file.name}</AttachmentTitle>
                <AttachmentDescription>
                  {pending.state === 'error'
                    ? pending.error || 'Upload failed'
                    : 'Uploading…'}
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction
                  aria-label="Remove upload"
                  onClick={() => removePendingUpload(pending.id)}
                >
                  {pending.state === 'uploading' ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <X />
                  )}
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ))}
        </AttachmentGroup>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
        <ScrollArea className="shrink-0" viewportClassName="scroll-fade-x">
          <TabsList className="w-max min-w-full justify-start">
            <TabsTrigger value="all">All ({documents.length})</TabsTrigger>
            {groupedDocuments.map((group) => (
              <TabsTrigger key={group.key} value={group.key}>
                {group.label} ({group.documents.length})
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>

        <TabsContent value="all" className="flex-1 min-h-0 mt-4">
          <ScrollArea className="flex-1 min-h-0" viewportClassName="scroll-fade">
            {documents.length === 0 && pendingUploads.length === 0
              ? renderDocumentStack([])
              : renderDocumentStack(documents)}
          </ScrollArea>
        </TabsContent>

        {groupedDocuments.map((group) => (
          <TabsContent key={group.key} value={group.key} className="flex-1 min-h-0 mt-4">
            <ScrollArea className="flex-1 min-h-0" viewportClassName="scroll-fade">
              {renderDocumentStack(group.documents)}
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>

      <DocumentViewerDialog
        document={viewerDocument}
        open={viewerDocument !== null}
        onOpenChange={(open) => {
          if (!open) setViewerDocument(null)
        }}
      />
    </div>
  )
}