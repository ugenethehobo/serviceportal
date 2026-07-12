'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteUploadedDocumentAction,
  getClientJobsForDocumentsAction,
  getUploadedDocumentsAction,
  uploadUploadedDocumentAction,
} from '@/app/action'
import {
  getPortalClientJobsForDocumentsAction,
  getPortalUploadedDocumentsAction,
} from '@/app/portal/actions'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
import { Skeleton } from '@/components/ui/skeleton'
import { DEFAULT_DOCUMENT_CATEGORY } from '@/lib/document-categories'
import {
  toGalleryDocuments,
  UPLOADED_DOCUMENT_ACCEPT_ATTRIBUTE,
  type GalleryDocument,
  type UploadedDocument,
} from '@/lib/uploaded-documents'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

type JobMeta = { id: string; title: string; start_time: string; status: string }

interface FolderDocumentsPanelProps {
  clientId: string
  scheduleId?: string | null
  refreshKey?: number
  title?: string
  description?: string
  variant?: 'staff' | 'portal'
  initialDocuments?: UploadedDocument[]
  initialJobs?: JobMeta[]
}

type PendingUpload = {
  id: string
  file: File
  state: 'uploading' | 'error'
  error?: string
}

function FolderStack({
  label,
  count,
  depth,
  defaultOpen,
  children,
}: {
  label: string
  count: number
  depth: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen ?? false}
      className="relative"
      style={{ marginLeft: depth * 12 }}
    >
      {depth > 0 && (
        <div
          className="absolute -left-3 top-0 bottom-2 w-px bg-border"
          aria-hidden
        />
      )}
      <CollapsibleTrigger
        className={cn(
          'group w-full flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
          'data-panel-open:border-primary/30 data-panel-open:shadow-sm'
        )}
      >
        <span className="text-muted-foreground">
          <Folder className="size-4 group-data-panel-open:hidden" />
          <FolderOpen className="size-4 hidden group-data-panel-open:block" />
        </span>
        <span className="flex-1 min-w-0 font-medium text-sm truncate">{label}</span>
        <span className="text-xs text-muted-foreground shrink-0">{count}</span>
        <ChevronRight className="size-4 text-muted-foreground shrink-0 group-data-panel-open:hidden" />
        <ChevronDown className="size-4 text-muted-foreground shrink-0 hidden group-data-panel-open:block" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 ml-1 space-y-2 pb-1 pl-3 border-l border-dashed border-border/80">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function FolderDocumentsPanel({
  clientId,
  scheduleId = null,
  refreshKey = 0,
  title,
  description,
  variant = 'staff',
  initialDocuments,
  initialJobs,
}: FolderDocumentsPanelProps) {
  const isPortal = variant === 'portal'
  const hasInitialData = initialDocuments !== undefined
  const [documents, setDocuments] = useState<GalleryDocument[]>(
    hasInitialData ? toGalleryDocuments(initialDocuments) : []
  )
  const [jobs, setJobs] = useState<JobMeta[]>(initialJobs ?? [])
  const [isLoading, setIsLoading] = useState(!hasInitialData)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadCategory, setUploadCategory] = useState('')
  const [uploadNotes, setUploadNotes] = useState('')
  const [viewerDocument, setViewerDocument] = useState<GalleryDocument | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isClientView = !scheduleId

  const fetchData = useCallback(async () => {
    const [docsResult, jobsResult] = await Promise.all([
      isPortal
        ? getPortalUploadedDocumentsAction()
        : getUploadedDocumentsAction(clientId, scheduleId),
      isClientView
        ? isPortal
          ? getPortalClientJobsForDocumentsAction()
          : getClientJobsForDocumentsAction(clientId)
        : Promise.resolve(null),
    ])

    if (docsResult.success) {
      setDocuments(toGalleryDocuments(docsResult.documents))
    } else {
      toast.error(docsResult.error || 'Failed to load documents')
    }

    if (jobsResult?.success) {
      setJobs(jobsResult.jobs)
    }

    setIsLoading(false)
  }, [clientId, scheduleId, isClientView, isPortal])

  useEffect(() => {
    if (hasInitialData && refreshKey === 0) return
    setIsLoading(true)
    void fetchData()
  }, [fetchData, refreshKey, hasInitialData])

  const categorySuggestions = useMemo(() => {
    const seen = new Set<string>()
    return documents
      .filter((d) => !d.isSystemDocument)
      .map((d) => d.displayCategory)
      .filter((cat) => {
        const key = cat.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [documents])

  const folderTree = useMemo(() => {
    if (!isClientView) {
      const byCategory = new Map<string, GalleryDocument[]>()
      for (const doc of documents) {
        const cat = doc.displayCategory
        const list = byCategory.get(cat) || []
        list.push(doc)
        byCategory.set(cat, list)
      }
      return Array.from(byCategory.entries()).map(([category, docs]) => ({
        type: 'category' as const,
        key: category,
        label: category,
        documents: docs,
      }))
    }

    const jobMap = new Map(jobs.map((j) => [j.id, j]))
    const clientLevel: GalleryDocument[] = []
    const byJob = new Map<string, GalleryDocument[]>()

    for (const doc of documents) {
      if (!doc.schedule_id) {
        clientLevel.push(doc)
        continue
      }
      const list = byJob.get(doc.schedule_id) || []
      list.push(doc)
      byJob.set(doc.schedule_id, list)
    }

    const jobFolders = Array.from(byJob.entries()).map(([jobId, docs]) => {
      const job = jobMap.get(jobId)
      const date = job?.start_time
        ? new Date(job.start_time).toLocaleDateString()
        : ''
      const label = job ? `${job.title}${date ? ` · ${date}` : ''}` : `Job ${jobId.slice(0, 8)}`
      const byCategory = new Map<string, GalleryDocument[]>()
      for (const doc of docs) {
        const cat = doc.displayCategory
        const list = byCategory.get(cat) || []
        list.push(doc)
        byCategory.set(cat, list)
      }
      return {
        type: 'job' as const,
        key: jobId,
        label,
        categories: Array.from(byCategory.entries()).map(([category, categoryDocs]) => ({
          category,
          documents: categoryDocs,
        })),
        documents: docs,
      }
    })

    jobFolders.sort((a, b) => b.label.localeCompare(a.label))

    return { clientLevel, jobFolders }
  }, [documents, jobs, isClientView])

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
    if (notes.trim()) formData.append('notes', notes.trim())
    formData.append('category', category)
    const result = await uploadUploadedDocumentAction(clientId, formData, scheduleId)
    if (result.success) {
      setDocuments((current) => [toGalleryDocuments([result.document])[0], ...current])
      setPendingUploads((current) => current.filter((e) => e.id !== pendingId))
      toast.success('Document uploaded')
    } else {
      setPendingUploads((current) =>
        current.map((e) =>
          e.id === pendingId ? { ...e, state: 'error', error: result.error || 'Upload failed' } : e
        )
      )
      toast.error(result.error || 'Failed to upload document')
    }
  }

  const handleConfirmUpload = async () => {
    if (selectedFiles.length === 0) return
    const category = uploadCategory.trim() || DEFAULT_DOCUMENT_CATEGORY
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

  const handleDelete = async (documentId: string) => {
    setDeletingId(documentId)
    const result = await deleteUploadedDocumentAction(documentId, clientId, scheduleId)
    if (result.success) {
      setDocuments((current) => current.filter((d) => d.id !== documentId))
      toast.success('Document deleted')
    } else {
      toast.error(result.error || 'Failed to delete document')
    }
    setDeletingId(null)
  }

  const handleDownload = (documentId: string) => {
    window.open(`/api/documents/${documentId}/download`, '_blank')
  }

  const isUploading = pendingUploads.some((e) => e.state === 'uploading')

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    )
  }

  const defaultTitle = isClientView ? 'All Documents' : 'Job Documents'
  const defaultDescription = isClientView
    ? 'Every file for this client, organized by job. Job documents appear here automatically.'
    : 'Files for this job, grouped by category.'

  const renderDocList = (items: GalleryDocument[]) => {
    if (items.length === 0) {
      return (
        <p className="text-sm text-muted-foreground py-3 px-1">No files in this folder.</p>
      )
    }
    return (
      <AttachmentGroup className="py-1">
        {items.map((doc) => (
          <DocumentGalleryItem
            key={doc.id}
            document={doc}
            onView={setViewerDocument}
            onDelete={isPortal ? () => {} : handleDelete}
            onDownload={handleDownload}
            isDeleting={deletingId === doc.id}
            canDelete={!isPortal && !doc.isSystemDocument}
            variant={isPortal ? 'portal' : 'staff'}
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
        {!isPortal && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={UPLOADED_DOCUMENT_ACCEPT_ATTRIBUTE}
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (files.length === 0) return
                setSelectedFiles(files)
                setUploadModalOpen(true)
              }}
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

      <Dialog open={uploadModalOpen} onOpenChange={(open) => !open && closeUploadModal()}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Upload documents</DialogTitle>
            <DialogDescription>
              Choose a category. Leave blank for {DEFAULT_DOCUMENT_CATEGORY}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedFiles.length > 0 && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} selected
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="upload-category">Category</Label>
              <Input
                id="upload-category"
                list="folder-category-suggestions"
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                placeholder={DEFAULT_DOCUMENT_CATEGORY}
              />
              {categorySuggestions.length > 0 && (
                <datalist id="folder-category-suggestions">
                  {categorySuggestions.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-notes">Label (optional)</Label>
              <Input
                id="upload-notes"
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                placeholder="Friendly name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeUploadModal}>Cancel</Button>
            <Button onClick={() => void handleConfirmUpload()} disabled={selectedFiles.length === 0}>
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingUploads.length > 0 && (
        <AttachmentGroup>
          {pendingUploads.map((pending) => (
            <Attachment
              key={pending.id}
              state={pending.state === 'error' ? 'error' : 'uploading'}
              className="min-w-48"
            >
              <AttachmentMedia variant="icon"><FileText /></AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{pending.file.name}</AttachmentTitle>
                <AttachmentDescription>
                  {pending.state === 'error' ? pending.error || 'Upload failed' : 'Uploading…'}
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction onClick={() => setPendingUploads((c) => c.filter((e) => e.id !== pending.id))}>
                  {pending.state === 'uploading' ? <Loader2 className="animate-spin" /> : <X />}
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ))}
        </AttachmentGroup>
      )}

      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
        {isClientView && !Array.isArray(folderTree) ? (
          <>
            <FolderStack
              label="Client files"
              count={folderTree.clientLevel.length}
              depth={0}
              defaultOpen={folderTree.clientLevel.length > 0}
            >
              {renderDocList(folderTree.clientLevel)}
            </FolderStack>
            {folderTree.jobFolders.map((jobFolder, index) => (
              <FolderStack
                key={jobFolder.key}
                label={jobFolder.label}
                count={jobFolder.documents.length}
                depth={0}
                defaultOpen={index === 0}
              >
                {jobFolder.categories.map((cat) => (
                  <FolderStack
                    key={`${jobFolder.key}-${cat.category}`}
                    label={cat.category}
                    count={cat.documents.length}
                    depth={1}
                  >
                    {renderDocList(cat.documents)}
                  </FolderStack>
                ))}
              </FolderStack>
            ))}
            {folderTree.clientLevel.length === 0 && folderTree.jobFolders.length === 0 && (
              <div className="flex items-center justify-center border border-dashed rounded-lg py-16 text-center">
                <p className="text-sm text-muted-foreground">No documents yet.</p>
              </div>
            )}
          </>
        ) : Array.isArray(folderTree) ? (
          folderTree.length > 0 ? (
            folderTree.map((folder, index) => (
              <FolderStack
                key={folder.key}
                label={folder.label}
                count={folder.documents.length}
                depth={0}
                defaultOpen={index === 0}
              >
                {renderDocList(folder.documents)}
              </FolderStack>
            ))
          ) : (
            <div className="flex items-center justify-center border border-dashed rounded-lg py-16 text-center">
              <p className="text-sm text-muted-foreground">No documents for this job yet.</p>
            </div>
          )
        ) : null}
      </div>

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