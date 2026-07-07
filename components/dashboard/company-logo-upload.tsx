'use client'

import { useEffect, useState } from 'react'
import { getCompanyLogoDisplayUrlAction, uploadCompanyLogoAction } from '@/app/action'
import { ImageAttachmentField } from '@/components/admin/image-attachment-field'
import { dispatchCompanyBrandingUpdate } from '@/lib/company-branding'
import { cn } from '@/lib/utils'

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
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!logoRef?.trim() || localPreview) {
      if (!localPreview) setDisplayUrl(null)
      return
    }

    void getCompanyLogoDisplayUrlAction(logoRef).then((result) => {
      if (cancelled) return
      setDisplayUrl(result.success && result.url ? result.url : null)
    })

    return () => {
      cancelled = true
    }
  }, [logoRef, localPreview])

  const imageSrc = localPreview || displayUrl

  const handleFile = async (file: File) => {
    setError(null)
    const preview = URL.createObjectURL(file)
    setLocalPreview(preview)
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
      URL.revokeObjectURL(preview)
      setLocalPreview(null)
      if (result.logoUrl) {
        setDisplayUrl(result.logoUrl)
      }
    } else {
      setError(result.error || 'Failed to upload logo')
      URL.revokeObjectURL(preview)
      setLocalPreview(null)
    }

    setIsUploading(false)
  }

  const handleRemove = async () => {
    setError(null)
    setLocalPreview(null)
    setDisplayUrl(null)
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

  return (
    <div className={cn(compact && 'sm:max-w-[280px]')}>
      <ImageAttachmentField
        label={compact ? 'Logo' : 'Company logo'}
        imageSrc={imageSrc}
        imageAlt={companyName ? `${companyName} logo` : 'Company logo'}
        fileName={imageSrc ? `${companyName || 'Company'} logo` : null}
        description={compact ? undefined : 'Updates the sidebar immediately after upload.'}
        isUploading={isUploading}
        error={error}
        onFileSelect={(file) => void handleFile(file)}
        onRemove={() => void handleRemove()}
        disabled={disabled}
        idleTitle="Upload company logo"
        idleDescription="Shown in the sidebar and documents"
        mediaClassName={cn('!w-16 !h-16 min-w-16', compact && '!w-20 !h-20 min-w-20')}
      />
    </div>
  )
}