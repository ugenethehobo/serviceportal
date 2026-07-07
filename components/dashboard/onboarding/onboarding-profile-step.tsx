'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import {
  removeAccountAvatarAction,
  updateAccountSettingsAction,
  uploadAccountAvatarAction,
} from '@/app/action'
import { ImageAttachmentField } from '@/components/admin/image-attachment-field'
import { AppearanceSettings } from '@/components/appearance-settings'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

export type OnboardingStepHandle = {
  validateAndSave: () => Promise<boolean>
}

type OnboardingProfileStepProps = {
  fullName: string
  email: string
  avatarUrl: string | null
  accentColor?: string | null
  backgroundImageUrl?: string | null
  onFullNameChange: (value: string) => void
}

export const OnboardingProfileStep = forwardRef<OnboardingStepHandle, OnboardingProfileStepProps>(
  function OnboardingProfileStep(
    {
      fullName,
      email,
      avatarUrl,
      accentColor = null,
      backgroundImageUrl = null,
      onFullNameChange,
    },
    ref
  ) {
    const [avatarPreview, setAvatarPreview] = useState<string | null>(avatarUrl)
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)

    useEffect(() => {
      setAvatarPreview(avatarUrl)
    }, [avatarUrl])

    const handleAvatarSelected = async (file: File) => {
      const localPreview = URL.createObjectURL(file)
      setAvatarPreview(localPreview)
      setUploadError(null)
      setIsUploadingAvatar(true)

      const formData = new FormData()
      formData.append('file', file)

      const result = await uploadAccountAvatarAction(formData)
      if (result.success) {
        URL.revokeObjectURL(localPreview)
        setAvatarPreview(result.avatarUrl)
        toast.success('Profile photo saved')
      } else {
        URL.revokeObjectURL(localPreview)
        setAvatarPreview(avatarUrl)
        setUploadError(result.error || 'Failed to upload profile photo')
        toast.error(result.error || 'Failed to upload profile photo')
      }

      setIsUploadingAvatar(false)
    }

    const handleRemoveAvatar = async () => {
      setIsUploadingAvatar(true)
      setUploadError(null)
      const result = await removeAccountAvatarAction()
      if (result.success) {
        setAvatarPreview(null)
        toast.success('Profile photo removed')
      } else {
        setUploadError(result.error || 'Failed to remove profile photo')
        toast.error(result.error || 'Failed to remove profile photo')
      }
      setIsUploadingAvatar(false)
    }

    useImperativeHandle(ref, () => ({
      validateAndSave: async () => {
        if (!fullName.trim()) {
          toast.error('Display name is required')
          return false
        }

        const result = await updateAccountSettingsAction({ fullName, email })
        if (!result.success) {
          toast.error(result.error || 'Failed to save display name')
          return false
        }

        return true
      },
    }))

    return (
      <div className="space-y-6">
        <ImageAttachmentField
          label="Profile photo"
          imageSrc={avatarPreview}
          imageAlt={fullName || 'Profile photo'}
          fileName={avatarPreview ? 'Profile photo' : null}
          isUploading={isUploadingAvatar}
          error={uploadError}
          onFileSelect={(file) => void handleAvatarSelected(file)}
          onRemove={() => void handleRemoveAvatar()}
          idleTitle="Upload profile photo"
          helperText="Optional — helps your team recognize you. JPG, PNG, WebP, or GIF · max 10 MB"
        />

        <div className="space-y-2">
          <Label htmlFor="onboarding-display-name">Display name</Label>
          <Input
            id="onboarding-display-name"
            value={fullName}
            onChange={(event) => onFullNameChange(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </div>

        <Separator />

        <AppearanceSettings
          embedded
          initialAccentColor={accentColor}
          initialBackgroundUrl={backgroundImageUrl}
        />
      </div>
    )
  }
)