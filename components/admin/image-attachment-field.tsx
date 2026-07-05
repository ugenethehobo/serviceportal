'use client'

import { useRef } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const DEFAULT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

type ImageAttachmentFieldProps = {
  label: string
  imageSrc: string | null
  fileName?: string | null
  description?: string
  isUploading?: boolean
  error?: string | null
  onFileSelect: (file: File) => void
  onRemove: () => void
  accept?: string
  disabled?: boolean
  idleTitle?: string
  idleDescription?: string
  className?: string
  mediaClassName?: string
  imageAlt?: string
}

export function ImageAttachmentField({
  label,
  imageSrc,
  fileName,
  description,
  isUploading = false,
  error,
  onFileSelect,
  onRemove,
  accept = DEFAULT_ACCEPT,
  disabled = false,
  idleTitle = 'Upload an image',
  idleDescription = 'JPG, PNG, WebP, or GIF',
  className,
  mediaClassName = '!w-14 !h-14 min-w-14',
  imageAlt = '',
}: ImageAttachmentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const openFilePicker = () => {
    if (disabled || isUploading) return
    inputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onFileSelect(file)
    event.target.value = ''
  }

  const attachmentState = error ? 'error' : isUploading ? 'uploading' : imageSrc ? 'done' : 'idle'

  return (
    <div className={cn('space-y-2', className)}>
      <Label>{label}</Label>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled || isUploading}
        onChange={handleFileChange}
      />

      {imageSrc ? (
        <Attachment state={attachmentState} className="w-full min-w-0">
          <AttachmentMedia variant="image" className={mediaClassName}>
            <img src={imageSrc} alt={imageAlt} />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{fileName || 'Current image'}</AttachmentTitle>
            <AttachmentDescription>
              {error || description || 'Click replace or remove to update'}
            </AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction
              aria-label={`Replace ${label.toLowerCase()}`}
              onClick={openFilePicker}
              disabled={disabled || isUploading}
            >
              {isUploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            </AttachmentAction>
            <AttachmentAction
              aria-label={`Remove ${label.toLowerCase()}`}
              onClick={onRemove}
              disabled={disabled || isUploading}
            >
              <Trash2 />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      ) : (
        <Attachment state={attachmentState} className="w-full min-w-0">
          <AttachmentTrigger
            aria-label={`Upload ${label.toLowerCase()}`}
            onClick={openFilePicker}
            disabled={disabled || isUploading}
          />
          <AttachmentMedia variant="icon">
            {isUploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{idleTitle}</AttachmentTitle>
            <AttachmentDescription>
              {error || idleDescription}
            </AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      )}
    </div>
  )
}