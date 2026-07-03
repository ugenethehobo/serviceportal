'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteJobPhotoAction,
  getJobPhotoCategoriesAction,
  getJobPhotosAction,
  uploadJobPhotoAction,
} from '@/app/action'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DEFAULT_JOB_PHOTO_CATEGORIES } from '@/lib/job-photo-categories'
import type { JobPhotoWithUrl } from '@/lib/job-photos'
import { toast } from 'sonner'
import { Camera, ImagePlus, Loader2, Trash2, X } from 'lucide-react'

interface JobPhotosPanelProps {
  scheduleId: string
  clientId: string
}

type PendingUpload = {
  id: string
  file: File
  previewUrl: string
  state: 'uploading' | 'error'
  error?: string
}

function groupPhotosByCategory(
  photos: JobPhotoWithUrl[],
  categories: string[]
) {
  const groups = new Map<string, JobPhotoWithUrl[]>()
  const uncategorized: JobPhotoWithUrl[] = []

  for (const photo of photos) {
    const category = photo.category?.trim()
    if (!category) {
      uncategorized.push(photo)
      continue
    }

    const existing = groups.get(category) || []
    existing.push(photo)
    groups.set(category, existing)
  }

  const ordered: Array<{ key: string; label: string; photos: JobPhotoWithUrl[] }> = []

  for (const category of categories) {
    const items = groups.get(category)
    if (items?.length) {
      ordered.push({ key: category, label: category, photos: items })
      groups.delete(category)
    }
  }

  for (const [category, items] of groups.entries()) {
    if (items.length > 0) {
      ordered.push({ key: category, label: category, photos: items })
    }
  }

  if (uncategorized.length > 0) {
    ordered.push({ key: '__uncategorized__', label: 'Uncategorized', photos: uncategorized })
  }

  return ordered
}

function PhotoGalleryItem({
  photo,
  onDelete,
  isDeleting,
}: {
  photo: JobPhotoWithUrl
  onDelete: (photoId: string) => void
  isDeleting: boolean
}) {
  return (
    <Attachment orientation="vertical" size="sm" className="w-28">
      <AttachmentMedia variant="image">
        <img src={photo.url} alt={photo.caption || photo.file_name} />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{photo.caption || photo.file_name}</AttachmentTitle>
        <AttachmentDescription>
          {photo.category || 'Uncategorized'}
        </AttachmentDescription>
        <AttachmentDescription>
          {new Date(photo.created_at).toLocaleString()}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction
          aria-label="Delete photo"
          onClick={() => onDelete(photo.id)}
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  )
}

export function JobPhotosPanel({ scheduleId, clientId }: JobPhotosPanelProps) {
  const [photos, setPhotos] = useState<JobPhotoWithUrl[]>([])
  const [categories, setCategories] = useState<string[]>([...DEFAULT_JOB_PHOTO_CATEGORIES])
  const [selectedCategory, setSelectedCategory] = useState<string>(
    DEFAULT_JOB_PHOTO_CATEGORIES[0]
  )
  const [isLoading, setIsLoading] = useState(true)
  const [caption, setCaption] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchPhotos = useCallback(async () => {
    const [photosResult, categoriesResult] = await Promise.all([
      getJobPhotosAction(scheduleId, clientId),
      getJobPhotoCategoriesAction(),
    ])

    if (photosResult.success) {
      setPhotos(photosResult.photos)
    } else {
      toast.error(photosResult.error || 'Failed to load photos')
    }

    if (categoriesResult.success) {
      setCategories(categoriesResult.categories)
      setSelectedCategory((current) =>
        categoriesResult.categories.includes(current)
          ? current
          : categoriesResult.categories[0]
      )
    }

    setIsLoading(false)
  }, [scheduleId, clientId])

  useEffect(() => {
    setIsLoading(true)
    fetchPhotos()
  }, [fetchPhotos])

  const groupedPhotos = useMemo(
    () => groupPhotosByCategory(photos, categories),
    [photos, categories]
  )

  const uploadFile = async (file: File, pendingId: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (caption.trim()) {
      formData.append('caption', caption.trim())
    }
    if (selectedCategory) {
      formData.append('category', selectedCategory)
    }

    const result = await uploadJobPhotoAction(scheduleId, clientId, formData)

    if (result.success) {
      setPhotos((current) => [result.photo, ...current])
      setPendingUploads((current) => current.filter((entry) => entry.id !== pendingId))
      toast.success('Photo uploaded')
    } else {
      setPendingUploads((current) =>
        current.map((entry) =>
          entry.id === pendingId
            ? { ...entry, state: 'error', error: result.error || 'Upload failed' }
            : entry
        )
      )
      toast.error(result.error || 'Failed to upload photo')
    }
  }

  const handleFilesSelected = async (fileList: FileList | null) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return

    const newPending = files.map((file) => ({
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      state: 'uploading' as const,
    }))

    setPendingUploads((current) => [...newPending, ...current])

    for (const pending of newPending) {
      await uploadFile(pending.file, pending.id)
    }

    setCaption('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePendingUpload = (pendingId: string) => {
    setPendingUploads((current) => {
      const entry = current.find((item) => item.id === pendingId)
      if (entry) URL.revokeObjectURL(entry.previewUrl)
      return current.filter((item) => item.id !== pendingId)
    })
  }

  const handleDelete = async (photoId: string) => {
    setDeletingId(photoId)
    const result = await deleteJobPhotoAction(photoId, scheduleId, clientId)
    if (result.success) {
      setPhotos((current) => current.filter((photo) => photo.id !== photoId))
      toast.success('Photo deleted')
    } else {
      toast.error(result.error || 'Failed to delete photo')
    }
    setDeletingId(null)
  }

  const isUploading = pendingUploads.some((entry) => entry.state === 'uploading')

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="aspect-square rounded-lg" />
        ))}
      </div>
    )
  }

  const renderPhotoGrid = (items: JobPhotoWithUrl[]) => {
    if (items.length === 0) {
      return (
        <div className="flex items-center justify-center border border-dashed rounded-lg py-12 text-center">
          <p className="text-sm text-muted-foreground">No photos in this category yet.</p>
        </div>
      )
    }

    return (
      <AttachmentGroup className="flex-wrap gap-3 overflow-visible snap-none">
        {items.map((photo) => (
          <PhotoGalleryItem
            key={photo.id}
            photo={photo}
            onDelete={handleDelete}
            isDeleting={deletingId === photo.id}
          />
        ))}
      </AttachmentGroup>
    )
  }

  return (
    <div className="flex flex-col gap-5 flex-1 min-h-0">
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Take or upload job site photos. Choose a category to keep large galleries organized.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="photo-category">Category</Label>
            <Select
              value={selectedCategory}
              onValueChange={(value) => {
                if (value) setSelectedCategory(value)
              }}
            >
              <SelectTrigger id="photo-category" className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="photo-caption">Caption (optional)</Label>
            <Input
              id="photo-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Describe this photo"
              disabled={isUploading}
            />
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          multiple
          className="hidden"
          onChange={(event) => handleFilesSelected(event.target.files)}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            size="lg"
            className="flex-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Camera className="size-4" />
            {isUploading ? 'Uploading…' : 'Take / Add Photos'}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="flex-1"
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.removeAttribute('capture')
                fileInputRef.current.click()
                fileInputRef.current.setAttribute('capture', 'environment')
              }
            }}
            disabled={isUploading}
          >
            <ImagePlus className="size-4" />
            Choose from library
          </Button>
        </div>

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
      </div>

      {photos.length === 0 && pendingUploads.length === 0 ? (
        <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg py-16 text-center">
          <div>
            <ImagePlus className="size-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No photos yet. Upload your first job site image.
            </p>
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <ScrollArea className="shrink-0" viewportClassName="scroll-fade-x">
            <TabsList className="w-max min-w-full justify-start">
              <TabsTrigger value="all">All ({photos.length})</TabsTrigger>
              {groupedPhotos.map((group) => (
                <TabsTrigger key={group.key} value={group.key}>
                  {group.label} ({group.photos.length})
                </TabsTrigger>
              ))}
            </TabsList>
          </ScrollArea>

          <TabsContent value="all" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="flex-1 min-h-0" viewportClassName="scroll-fade">
              {renderPhotoGrid(photos)}
            </ScrollArea>
          </TabsContent>

          {groupedPhotos.map((group) => (
            <TabsContent key={group.key} value={group.key} className="flex-1 min-h-0 mt-4">
              <ScrollArea className="flex-1 min-h-0" viewportClassName="scroll-fade">
                {renderPhotoGrid(group.photos)}
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}