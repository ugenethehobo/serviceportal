'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  removeAccountAvatarAction,
  updateAccountSettingsAction,
  uploadAccountAvatarAction,
} from '@/app/action'
import { ImageAttachmentField } from '@/components/admin/image-attachment-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

type UserProfileSettingsProps = {
  fullName: string
  email: string
  avatarUrl: string | null
  roleLabel: string
  onFullNameChange: (value: string) => void
}

export function UserProfileSettings({
  fullName,
  email,
  avatarUrl,
  roleLabel,
  onFullNameChange,
}: UserProfileSettingsProps) {
  const router = useRouter()
  const [isSavingName, setIsSavingName] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(avatarUrl)
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
      toast.success('Profile photo updated')
      window.dispatchEvent(new CustomEvent('dashboard-profile-updated'))
      router.refresh()
    } else {
      URL.revokeObjectURL(localPreview)
      setAvatarPreview(avatarUrl)
      setUploadError(result.error || 'Failed to upload profile photo')
      toast.error(result.error || 'Failed to upload profile photo')
    }

    setIsUploadingAvatar(false)
  }

  const handleSaveName = async () => {
    setIsSavingName(true)
    const result = await updateAccountSettingsAction({
      fullName,
      email,
    })

    if (result.success) {
      toast.success('Display name updated')
      window.dispatchEvent(new CustomEvent('dashboard-profile-updated'))
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to update display name')
    }
    setIsSavingName(false)
  }

  const handleRemoveAvatar = async () => {
    setIsUploadingAvatar(true)
    setUploadError(null)
    const result = await removeAccountAvatarAction()
    if (result.success) {
      setAvatarPreview(null)
      toast.success('Profile photo removed')
      window.dispatchEvent(new CustomEvent('dashboard-profile-updated'))
      router.refresh()
    } else {
      setUploadError(result.error || 'Failed to remove profile photo')
      toast.error(result.error || 'Failed to remove profile photo')
    }
    setIsUploadingAvatar(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your name and profile photo appear across the dashboard.
        </p>
      </div>

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
      />

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="settings-profile-name">Display name</Label>
          <Input
            id="settings-profile-name"
            value={fullName}
            onChange={(event) => onFullNameChange(event.target.value)}
            autoComplete="name"
          />
        </div>
        <Button type="button" onClick={handleSaveName} disabled={isSavingName}>
          {isSavingName ? 'Saving…' : 'Save display name'}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Signed in as <span className="text-foreground">{email}</span> · {roleLabel}
      </p>
    </div>
  )
}