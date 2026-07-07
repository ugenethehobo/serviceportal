'use client'

import { useEffect, useState } from 'react'
import {
  removeBackgroundImageAction,
  updateAccentColorAction,
  uploadBackgroundImageAction,
} from '@/app/action'
import { ImageAttachmentField } from '@/components/admin/image-attachment-field'
import { usePersonalization } from '@/components/personalization-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ACCENT_COLOR_PRESETS, normalizeAccentColor } from '@/lib/personalization'
import {
  PROFILE_IMAGE_MAX_SIZE_LABEL,
  profileImageIdleDescription,
} from '@/lib/profile-image-upload'
import { cn } from '@/lib/utils'
import { ImageIcon, Palette, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

interface PersonalizationSettingsProps {
  embedded?: boolean
  initialAccentColor?: string | null
  initialBackgroundUrl?: string | null
  /** When false, shows company branding read-only for non-admin staff. */
  canEdit?: boolean
}

export function PersonalizationSettings({
  embedded = false,
  initialAccentColor = null,
  initialBackgroundUrl = null,
  canEdit = true,
}: PersonalizationSettingsProps) {
  const { accentColor, backgroundImageUrl, setAccentColor, setBackgroundImageUrl } =
    usePersonalization()

  const [selectedAccent, setSelectedAccent] = useState<string | null>(
    initialAccentColor ?? accentColor
  )
  const [customAccent, setCustomAccent] = useState(
    (initialAccentColor ?? accentColor) || '#2563eb'
  )
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(
    initialBackgroundUrl ?? backgroundImageUrl
  )
  const [isUploadingBackground, setIsUploadingBackground] = useState(false)
  const [isSavingAccent, setIsSavingAccent] = useState(false)
  const [backgroundError, setBackgroundError] = useState<string | null>(null)

  useEffect(() => {
    if (accentColor !== null) setSelectedAccent(accentColor)
    if (backgroundImageUrl !== null) setBackgroundPreview(backgroundImageUrl)
  }, [accentColor, backgroundImageUrl])

  const persistAccent = async (hex: string | null) => {
    setIsSavingAccent(true)
    const result = await updateAccentColorAction(hex)
    setIsSavingAccent(false)

    if (!result.success) {
      toast.error(result.error || 'Failed to save accent color')
      return false
    }

    setAccentColor(hex)
    return true
  }

  const handlePresetSelect = async (hex: string) => {
    setSelectedAccent(hex)
    setCustomAccent(hex)
    const ok = await persistAccent(hex)
    if (ok) toast.success('Accent color updated')
  }

  const handleCustomAccentSave = async () => {
    const normalized = normalizeAccentColor(customAccent)
    if (!normalized) {
      toast.error('Enter a valid hex color like #2563eb')
      return
    }
    setSelectedAccent(normalized)
    const ok = await persistAccent(normalized)
    if (ok) toast.success('Accent color updated')
  }

  const handleResetAccent = async () => {
    setSelectedAccent(null)
    const ok = await persistAccent(null)
    if (ok) toast.success('Accent color reset to default')
  }

  const handleBackgroundSelect = async (file: File) => {
    const localPreview = URL.createObjectURL(file)
    setBackgroundPreview(localPreview)
    setBackgroundError(null)
    setIsUploadingBackground(true)

    const formData = new FormData()
    formData.append('file', file)

    const result = await uploadBackgroundImageAction(formData)
    setIsUploadingBackground(false)

    if (result.success) {
      URL.revokeObjectURL(localPreview)
      setBackgroundPreview(result.backgroundUrl)
      setBackgroundImageUrl(result.backgroundUrl)
      toast.success('Background image saved')
    } else {
      URL.revokeObjectURL(localPreview)
      setBackgroundPreview(backgroundImageUrl)
      setBackgroundError(result.error || 'Failed to upload background')
      toast.error(result.error || 'Failed to upload background')
    }
  }

  const handleBackgroundRemove = async () => {
    setIsUploadingBackground(true)
    setBackgroundError(null)
    const result = await removeBackgroundImageAction()
    setIsUploadingBackground(false)

    if (result.success) {
      setBackgroundPreview(null)
      setBackgroundImageUrl(null)
      toast.success('Background image removed')
    } else {
      setBackgroundError(result.error || 'Failed to remove background')
      toast.error(result.error || 'Failed to remove background')
    }
  }

  const content = (
    <div className="space-y-6">
      {!canEdit && (
        <p className="text-xs text-muted-foreground rounded-lg border border-dashed px-3 py-2">
          Company background and accent color are managed by your admin and apply to everyone on
          your team and in the client portal.
        </p>
      )}

      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-muted-foreground">
            <ImageIcon className="size-4" />
          </div>
          <div>
            <Label className="text-sm font-medium">Background photo</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Shared across your company. Fills the entire app behind a heavy light or dark overlay,
              depending on your theme.
            </p>
          </div>
        </div>

        <ImageAttachmentField
          label="Background photo"
          imageSrc={backgroundPreview}
          imageAlt="App background"
          fileName={backgroundPreview ? 'Background photo' : null}
          isUploading={isUploadingBackground}
          error={backgroundError}
          disabled={!canEdit}
          onFileSelect={(file) => void handleBackgroundSelect(file)}
          onRemove={() => void handleBackgroundRemove()}
          idleTitle={canEdit ? 'Upload a background photo' : 'No company background photo'}
          idleDescription={canEdit ? profileImageIdleDescription() : undefined}
          helperText={
            canEdit
              ? `Landscape photos work best. JPG, PNG, or WebP · max ${PROFILE_IMAGE_MAX_SIZE_LABEL}`
              : 'Ask your company admin to update this in Settings → Appearance.'
          }
          mediaClassName="!w-full !h-28 min-w-full"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-muted-foreground">
            <Palette className="size-4" />
          </div>
          <div>
            <Label className="text-sm font-medium">Accent color</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Shared across your company. Updates accent and primary colors for buttons, links, and
              highlights.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {ACCENT_COLOR_PRESETS.map((preset) => {
            const selected = selectedAccent === preset.hex
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                aria-label={`${preset.label} accent`}
                disabled={!canEdit || isSavingAccent}
                onClick={() => void handlePresetSelect(preset.hex)}
                className={cn(
                  'size-9 rounded-md border-2 transition-transform hover:scale-105',
                  selected ? 'border-foreground ring-2 ring-ring/40' : 'border-transparent'
                )}
                style={{ backgroundColor: preset.hex }}
              />
            )
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="space-y-2 flex-1">
            <Label htmlFor="custom-accent-color">Custom color</Label>
            <div className="flex gap-2">
              <Input
                id="custom-accent-color"
                value={customAccent}
                onChange={(event) => setCustomAccent(event.target.value)}
                placeholder="#2563eb"
                className="font-mono"
                disabled={!canEdit}
              />
              <input
                type="color"
                value={normalizeAccentColor(customAccent) || '#2563eb'}
                onChange={(event) => setCustomAccent(event.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Pick accent color"
                disabled={!canEdit}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleCustomAccentSave()}
            disabled={!canEdit || isSavingAccent}
          >
            Apply color
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-0 text-muted-foreground hover:text-foreground"
          onClick={() => void handleResetAccent()}
          disabled={!canEdit || isSavingAccent || !selectedAccent}
        >
          <RotateCcw className="size-4 mr-2" />
          Reset to default accent
        </Button>
      </div>
    </div>
  )

  if (embedded) return content

  return <div className="rounded-lg border bg-card/50 p-4">{content}</div>
}