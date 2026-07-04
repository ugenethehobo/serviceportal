'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  removeAccountAvatarAction,
  updateAccountSettingsAction,
  uploadAccountAvatarAction,
} from '@/app/action'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Camera, Loader2, Trash2, User } from 'lucide-react'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setAvatarPreview(avatarUrl)
  }, [avatarUrl])

  const handleAvatarSelected = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return

    setAvatarPreview(URL.createObjectURL(file))
    setIsUploadingAvatar(true)

    const formData = new FormData()
    formData.append('file', file)

    const result = await uploadAccountAvatarAction(formData)
    if (result.success) {
      setAvatarPreview(result.avatarUrl)
      toast.success('Profile photo updated')
      window.dispatchEvent(new CustomEvent('dashboard-profile-updated'))
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to upload profile photo')
      setAvatarPreview(avatarUrl)
    }

    setIsUploadingAvatar(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
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
    const result = await removeAccountAvatarAction()
    if (result.success) {
      setAvatarPreview(null)
      toast.success('Profile photo removed')
      window.dispatchEvent(new CustomEvent('dashboard-profile-updated'))
      router.refresh()
    } else {
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

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Avatar size="lg" className="size-20">
          {avatarPreview ? (
            <AvatarImage src={avatarPreview} alt={fullName || 'Profile photo'} />
          ) : null}
          <AvatarFallback className="text-lg">
            {fullName ? fullName.slice(0, 2).toUpperCase() : <User className="size-6" />}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(event) => handleAvatarSelected(event.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAvatar}
          >
            {isUploadingAvatar ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Camera className="size-4" />
            )}
            {isUploadingAvatar ? 'Uploading…' : 'Change photo'}
          </Button>
          {avatarPreview && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleRemoveAvatar}
              disabled={isUploadingAvatar}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          )}
        </div>
      </div>

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