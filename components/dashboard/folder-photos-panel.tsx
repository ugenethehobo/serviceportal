'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteJobPhotoAction,
  getClientJobsForPhotosAction,
  getClientPhotosAction,
  uploadJobPhotoAction,
} from '@/app/action'
import { getPortalPhotosPageDataAction } from '@/app/portal/actions'
import { PhotoStorageMeter } from '@/components/dashboard/photo-storage-meter'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
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
import { DEFAULT_JOB_PHOTO_CATEGORY, getPhotoDisplayCategory, type JobPhotoWithUrl } from '@/lib/job-photos'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  ImagePlus,
  Loader2,
  Trash2,
  X,
} from 'lucide-react'

type PhotoJobMeta = { id: string; title: string; start_time: string; status: string }

type PhotoStorageInfo = {
  usedBytes: number
  limitBytes: number
  usedLabel: string
  limitLabel: string
  plan: string
}

interface FolderPhotosPanelProps {
  clientId: string
  scheduleId?: string | null
  refreshKey?: number
  title?: string
  description?: string
  variant?: 'staff' | 'portal'
  initialPhotos?: JobPhotoWithUrl[]
  initialJobs?: PhotoJobMeta[]
  initialCategories?: string[]
  initialStorage?: PhotoStorageInfo
}

type PendingUpload = {
  id: string
  file: File
  previewUrl: string
  state: 'uploading' | 'error'
  error?: string
}

const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

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

function PhotoGalleryItem({
  photo,
  onView,
  onDelete,
  isDeleting,
  canDelete,
}: {
  photo: JobPhotoWithUrl
  onView: (photo: JobPhotoWithUrl) => void
  onDelete: (photoId: string) => void
  isDeleting: boolean
  canDelete: boolean
}) {
  const displayName = photo.caption?.trim() || photo.file_name

  return (
    <Attachment orientation="vertical" size="sm" className="w-28">
      <AttachmentTrigger aria-label={`View ${displayName}`} onClick={() => onView(photo)} />
      <AttachmentMedia variant="image">
        <img src={photo.url} alt={displayName} />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{displayName}</AttachmentTitle>
        <AttachmentDescription>{getPhotoDisplayCategory(photo.category)}</AttachmentDescription>
        <AttachmentDescription>{new Date(photo.created_at).toLocaleString()}</AttachmentDescription>
      </AttachmentContent>
      {canDelete && (
        <AttachmentActions>
          <AttachmentAction
            aria-label="Delete photo"
            onClick={() => onDelete(photo.id)}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </AttachmentAction>
        </AttachmentActions>
      )}
    </Attachment>
  )
}

function PhotoViewerDialog({
  photo,
  open,
  onOpenChange,
}: {
  photo: JobPhotoWithUrl | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!photo) return null
  const displayName = photo.caption?.trim() || photo.file_name

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle>{displayName}</DialogTitle>
          <DialogDescription>
            {getPhotoDisplayCategory(photo.category)} · {new Date(photo.created_at).toLocaleString()}
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted/30 flex items-center justify-center max-h-[70vh] p-4">
          <img
            src={photo.url}
            alt={displayName}
            className="max-h-[65vh] max-w-full rounded-md object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function FolderPhotosPanel({
  clientId,
  scheduleId = null,
  refreshKey = 0,
  title,
  description,
  variant = 'staff',
  initialPhotos,
  initialJobs,
  initialCategories,
  initialStorage,
}: FolderPhotosPanelProps) {
  const isPortal = variant === 'portal'
  const isClientView = !scheduleId
  const hasInitialData = initialPhotos !== undefined
  const [photos, setPhotos] = useState<JobPhotoWithUrl[]>(initialPhotos ?? [])
  const [jobs, setJobs] = useState<PhotoJobMeta[]>(initialJobs ?? [])
  const [categories, setCategories] = useState<string[]>(initialCategories ?? [])
  const [storage, setStorage] = useState<PhotoStorageInfo | null>(initialStorage ?? null)
  const [isLoading, setIsLoading] = useState(!hasInitialData)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadCategory, setUploadCategory] = useState('')
  const [uploadCaption, setUploadCaption] = useState('')
  const [viewerPhoto, setViewerPhoto] = useState<JobPhotoWithUrl | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    if (isPortal) {
      const result = await getPortalPhotosPageDataAction(
        scheduleId ? { scheduleId } : undefined
      )
      if (result.success) {
        setPhotos(result.photos)
        setJobs(result.jobs)
        setCategories(result.categories)
      } else {
        toast.error(result.error || 'Failed to load photos')
      }
      setIsLoading(false)
      return
    }

    const [photosResult, jobsResult] = await Promise.all([
      getClientPhotosAction(clientId, scheduleId ? { scheduleId } : undefined),
      isClientView
        ? getClientJobsForPhotosAction(clientId)
        : Promise.resolve(null),
    ])

    if (photosResult.success) {
      setPhotos(photosResult.photos)
      setCategories(photosResult.categories)
      setStorage(photosResult.storage)
    } else {
      toast.error(photosResult.error || 'Failed to load photos')
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
    const merged = [...categories, ...photos.map((p) => getPhotoDisplayCategory(p.category))]
    return merged.filter((cat) => {
      const key = cat.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [categories, photos])

  const folderTree = useMemo(() => {
    if (!isClientView) {
      const byCategory = new Map<string, JobPhotoWithUrl[]>()
      for (const photo of photos) {
        const cat = getPhotoDisplayCategory(photo.category)
        const list = byCategory.get(cat) || []
        list.push(photo)
        byCategory.set(cat, list)
      }
      return Array.from(byCategory.entries()).map(([category, items]) => ({
        type: 'category' as const,
        key: category,
        label: category,
        photos: items,
      }))
    }

    const jobMap = new Map(jobs.map((j) => [j.id, j]))
    const byJob = new Map<string, JobPhotoWithUrl[]>()

    for (const photo of photos) {
      const list = byJob.get(photo.schedule_id) || []
      list.push(photo)
      byJob.set(photo.schedule_id, list)
    }

    const jobFolders = Array.from(byJob.entries()).map(([jobId, jobPhotos]) => {
      const job = jobMap.get(jobId)
      const date = job?.start_time
        ? new Date(job.start_time).toLocaleDateString()
        : ''
      const label = job ? `${job.title}${date ? ` · ${date}` : ''}` : `Job ${jobId.slice(0, 8)}`
      const byCategory = new Map<string, JobPhotoWithUrl[]>()
      for (const photo of jobPhotos) {
        const cat = getPhotoDisplayCategory(photo.category)
        const list = byCategory.get(cat) || []
        list.push(photo)
        byCategory.set(cat, list)
      }
      return {
        type: 'job' as const,
        key: jobId,
        label,
        categories: Array.from(byCategory.entries()).map(([category, categoryPhotos]) => ({
          category,
          photos: categoryPhotos,
        })),
        photos: jobPhotos,
      }
    })

    jobFolders.sort((a, b) => b.label.localeCompare(a.label))
    return { jobFolders }
  }, [photos, jobs, isClientView])

  const resetUploadModal = () => {
    setSelectedFiles([])
    setUploadCategory(categories[0] || '')
    setUploadCaption('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const closeUploadModal = () => {
    setUploadModalOpen(false)
    resetUploadModal()
  }

  const uploadFile = async (
    file: File,
    category: string,
    caption: string,
    pendingId: string
  ) => {
    if (!scheduleId) {
      toast.error('Select a job before uploading photos')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    if (caption.trim()) formData.append('caption', caption.trim())
    if (category.trim()) formData.append('category', category.trim())

    const result = await uploadJobPhotoAction(scheduleId, clientId, formData)
    if (result.success) {
      setPhotos((current) => [result.photo, ...current])
      setStorage((current) =>
        current
          ? {
              ...current,
              usedBytes: current.usedBytes + file.size,
              usedLabel: current.usedLabel,
            }
          : current
      )
      setPendingUploads((current) => current.filter((e) => e.id !== pendingId))
      toast.success('Photo uploaded')
      void fetchData()
    } else {
      setPendingUploads((current) =>
        current.map((e) =>
          e.id === pendingId ? { ...e, state: 'error', error: result.error || 'Upload failed' } : e
        )
      )
      toast.error(result.error || 'Failed to upload photo')
    }
  }

  const handleConfirmUpload = async () => {
    if (selectedFiles.length === 0 || !scheduleId) return
    const category = uploadCategory.trim() || categories[0] || DEFAULT_JOB_PHOTO_CATEGORY
    const newPending = selectedFiles.map((file) => ({
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      state: 'uploading' as const,
    }))
    setPendingUploads((current) => [...newPending, ...current])
    closeUploadModal()
    for (const pending of newPending) {
      await uploadFile(pending.file, category, uploadCaption, pending.id)
    }
  }

  const handleDelete = async (photoId: string) => {
    const photo = photos.find((p) => p.id === photoId)
    if (!photo) return
    setDeletingId(photoId)
    const result = await deleteJobPhotoAction(photoId, photo.schedule_id, clientId)
    if (result.success) {
      setPhotos((current) => current.filter((p) => p.id !== photoId))
      setStorage((current) =>
        current
          ? {
              ...current,
              usedBytes: Math.max(0, current.usedBytes - photo.file_size),
            }
          : current
      )
      toast.success('Photo deleted')
      void fetchData()
    } else {
      toast.error(result.error || 'Failed to delete photo')
    }
    setDeletingId(null)
  }

  const removePendingUpload = (pendingId: string) => {
    setPendingUploads((current) => {
      const entry = current.find((item) => item.id === pendingId)
      if (entry) URL.revokeObjectURL(entry.previewUrl)
      return current.filter((item) => item.id !== pendingId)
    })
  }

  const isUploading = pendingUploads.some((e) => e.state === 'uploading')
  const canUpload = !isPortal && Boolean(scheduleId)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    )
  }

  const defaultTitle = isClientView ? 'Job Photos' : 'Job Photos'
  const defaultDescription = isClientView
    ? 'Every job site photo for this client, organized by visit and category.'
    : 'Photos for this job, grouped by category folder.'

  const renderPhotoGrid = (items: JobPhotoWithUrl[]) => {
    if (items.length === 0) {
      return (
        <p className="text-sm text-muted-foreground py-3 px-1">No photos in this folder.</p>
      )
    }
    return (
      <AttachmentGroup className="flex-wrap gap-3 py-1 overflow-visible snap-none">
        {items.map((photo) => (
          <PhotoGalleryItem
            key={photo.id}
            photo={photo}
            onView={setViewerPhoto}
            onDelete={handleDelete}
            isDeleting={deletingId === photo.id}
            canDelete={!isPortal}
          />
        ))}
      </AttachmentGroup>
    )
  }

  return (
    <div className="flex flex-col gap-5 flex-1 min-h-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div>
            <h3 className="font-semibold tracking-tight">{title || defaultTitle}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {description || defaultDescription}
            </p>
          </div>
          {!isPortal && storage && (
            <PhotoStorageMeter
              usedLabel={storage.usedLabel}
              limitLabel={storage.limitLabel}
              usedBytes={storage.usedBytes}
              limitBytes={storage.limitBytes}
              className="max-w-sm"
            />
          )}
        </div>
        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={PHOTO_ACCEPT}
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (files.length === 0) return
                setSelectedFiles(files)
                setUploadCategory(categories[0] || '')
                setUploadModalOpen(true)
              }}
            />
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="max-md:min-h-11"
              >
                <Camera className="size-4" />
                {isUploading ? 'Uploading…' : 'Take / Add Photos'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute('capture')
                    fileInputRef.current.click()
                    fileInputRef.current.setAttribute('capture', 'environment')
                  }
                }}
                disabled={isUploading}
                className="max-md:min-h-11"
              >
                <ImagePlus className="size-4" />
                Choose from library
              </Button>
            </div>
          </>
        )}
      </div>

      <Dialog open={uploadModalOpen} onOpenChange={(open) => !open && closeUploadModal()}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Upload photos</DialogTitle>
            <DialogDescription>
              Choose a category folder. Leave blank for {DEFAULT_JOB_PHOTO_CATEGORY}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedFiles.length > 0 && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                {selectedFiles.length} photo{selectedFiles.length === 1 ? '' : 's'} selected
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="upload-photo-category">Category</Label>
              <Input
                id="upload-photo-category"
                list="folder-photo-category-suggestions"
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                placeholder={categories[0] || DEFAULT_JOB_PHOTO_CATEGORY}
              />
              {categorySuggestions.length > 0 && (
                <datalist id="folder-photo-category-suggestions">
                  {categorySuggestions.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-photo-caption">Caption (optional)</Label>
              <Input
                id="upload-photo-caption"
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
                placeholder="Describe these photos"
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
              <AttachmentMedia variant="image">
                <img src={pending.previewUrl} alt={pending.file.name} />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{pending.file.name}</AttachmentTitle>
                <AttachmentDescription>
                  {pending.state === 'error' ? pending.error || 'Upload failed' : 'Uploading…'}
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction onClick={() => removePendingUpload(pending.id)}>
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
            {folderTree.jobFolders.map((jobFolder, index) => (
              <FolderStack
                key={jobFolder.key}
                label={jobFolder.label}
                count={jobFolder.photos.length}
                depth={0}
                defaultOpen={index === 0}
              >
                {jobFolder.categories.map((cat) => (
                  <FolderStack
                    key={`${jobFolder.key}-${cat.category}`}
                    label={cat.category}
                    count={cat.photos.length}
                    depth={1}
                  >
                    {renderPhotoGrid(cat.photos)}
                  </FolderStack>
                ))}
              </FolderStack>
            ))}
            {folderTree.jobFolders.length === 0 && (
              <div className="flex items-center justify-center border border-dashed rounded-lg py-16 text-center">
                <p className="text-sm text-muted-foreground">No photos yet.</p>
              </div>
            )}
          </>
        ) : Array.isArray(folderTree) ? (
          folderTree.length > 0 ? (
            folderTree.map((folder, index) => (
              <FolderStack
                key={folder.key}
                label={folder.label}
                count={folder.photos.length}
                depth={0}
                defaultOpen={index === 0}
              >
                {renderPhotoGrid(folder.photos)}
              </FolderStack>
            ))
          ) : (
            <div className="flex items-center justify-center border border-dashed rounded-lg py-16 text-center">
              <p className="text-sm text-muted-foreground">No photos for this job yet.</p>
            </div>
          )
        ) : null}
      </div>

      <PhotoViewerDialog
        photo={viewerPhoto}
        open={viewerPhoto !== null}
        onOpenChange={(open) => {
          if (!open) setViewerPhoto(null)
        }}
      />
    </div>
  )
}