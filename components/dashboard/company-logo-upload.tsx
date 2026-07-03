'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CompanyLogoImage } from '@/components/dashboard/company-logo-image'
import { uploadCompanyLogoAction } from '@/app/action'
import { dispatchCompanyBrandingUpdate } from '@/lib/company-branding'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 5 * 1024 * 1024

interface CompanyLogoUploadProps {
  companyName: string
  logoRef: string | null
  onLogoChange: (logoRef: string | null) => void
  disabled?: boolean
  compact?: boolean
}

export function CompanyLogoUpload({
  companyName,
  logoRef,
  onLogoChange,
  disabled = false,
  compact = false,
}: CompanyLogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setError('')
    const localPreview = URL.createObjectURL(file)
    setPreviewUrl(localPreview)

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Use a JPG, PNG, WebP, or GIF image.')
      URL.revokeObjectURL(localPreview)
      setPreviewUrl(null)
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('Image must be 5 MB or smaller.')
      URL.revokeObjectURL(localPreview)
      setPreviewUrl(null)
      return
    }

    setIsUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    const result = await uploadCompanyLogoAction(formData)

    if (result.success) {
      const storedRef = result.logoPath ?? result.logoUrl
      onLogoChange(storedRef)
      dispatchCompanyBrandingUpdate({
        logo_url: storedRef,
        name: companyName,
      })
      if (localPreview) URL.revokeObjectURL(localPreview)
      setPreviewUrl(null)
    } else {
      setError(result.error || 'Failed to upload logo')
      URL.revokeObjectURL(localPreview)
      setPreviewUrl(null)
    }

    setIsUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleRemove = async () => {
    setError('')
    setPreviewUrl(null)
    setIsUploading(true)

    const result = await uploadCompanyLogoAction(null)

    if (result.success) {
      onLogoChange(null)
      dispatchCompanyBrandingUpdate({
        logo_url: null,
        name: companyName,
      })
    } else {
      setError(result.error || 'Failed to remove logo')
    }

    setIsUploading(false)
  }

  const imageSize = compact ? 'size-20' : 'size-16'
  const showPreview = previewUrl && isUploading

  return (
    <div className={cn('space-y-2', compact && 'sm:max-w-[140px]')}>
      {!compact && <Label>Company logo</Label>}

      <div className={cn('flex gap-3', compact ? 'flex-col items-center' : 'items-center')}>
        {showPreview ? (
          <img
            src={previewUrl}
            alt="Upload preview"
            className={cn(
              'rounded-lg object-cover ring-1 ring-border shrink-0',
              imageSize
            )}
          />
        ) : (
          <CompanyLogoImage
            logoRef={logoRef}
            companyName={companyName}
            imageClassName={cn('rounded-lg ring-1 ring-border', imageSize)}
            fallbackClassName={cn('rounded-lg ring-1 ring-border', imageSize, compact ? 'text-xl' : 'text-lg')}
          />
        )}

        <div className={cn('flex gap-2', compact ? 'flex-col w-full' : 'flex-wrap items-center')}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="hidden"
            disabled={disabled || isUploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleFile(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(compact && 'w-full')}
            disabled={disabled || isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <ImagePlus className="size-4 mr-2" />
            )}
            {logoRef ? 'Change' : 'Upload'}
          </Button>
          {logoRef && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(compact && 'w-full')}
              disabled={disabled || isUploading}
              onClick={() => void handleRemove()}
            >
              <Trash2 className="size-4 mr-2" />
              Remove
            </Button>
          )}
        </div>
      </div>

      {!compact && (
        <p className="text-xs text-muted-foreground">
          Updates the sidebar immediately after upload.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}