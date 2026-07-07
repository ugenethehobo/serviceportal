'use client'

import { useRef, useState } from 'react'
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
import {
  PROFILE_IMAGE_ACCEPT,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_MAX_SIZE_LABEL,
  profileImageIdleDescription,
  validateProfileImageFile,
} from '@/lib/profile-image-upload'
import { cn } from '@/lib/utils'

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
  maxFileSizeBytes?: number
  maxFileSizeLabel?: string
  disabled?: boolean
  idleTitle?: string
  idleDescription?: string
  className?: string
  mediaClassName?: string
  imageAlt?: string
  helperText?: string
}

export function ImageAttachmentField({
  label,
  imageSrc,
  fileName,
  description,
  isUploading = false,
  error: externalError,
  onFileSelect,
  onRemove,
  accept = PROFILE_IMAGE_ACCEPT,
  maxFileSizeBytes = PROFILE_IMAGE_MAX_BYTES,
  maxFileSizeLabel = PROFILE_IMAGE_MAX_SIZE_LABEL,
  disabled = false,
  idleTitle = 'Upload an image',
  idleDescription,
  className,
  mediaClassName = '!w-14 !h-14 min-w-14',
  imageAlt = '',
  helperText,
}: ImageAttachmentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const resolvedIdleDescription =
    idleDescription ?? profileImageIdleDescription()
  const resolvedHelperText =
    helperText ?? `Accepted formats: JPG, PNG, WebP, GIF · max ${maxFileSizeLabel}`
  const displayError = externalError || localError

  const openFilePicker = () => {
    if (disabled || isUploading) return
    inputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setLocalError(null)

    const validationError = validateProfileImageFile(file)
    if (validationError) {
      setLocalError(validationError)
      return
    }

    if (file.size > maxFileSizeBytes) {
      setLocalError(`Image must be ${maxFileSizeLabel} or smaller.`)
      return
    }

    onFileSelect(file)
  }

  const attachmentState = displayError
    ? 'error'
    : isUploading
      ? 'uploading'
      : imageSrc
        ? 'done'
        : 'idle'

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
              {displayError || description || 'Click replace or remove to update'}
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
              onClick={() => {
                setLocalError(null)
                onRemove()
              }}
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
              {displayError || resolvedIdleDescription}
            </AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      )}

      <p className="text-xs text-muted-foreground">{resolvedHelperText}</p>
    </div>
  )
}