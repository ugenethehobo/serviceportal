'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  removeBackgroundImageAction,
  updateAccentColorAction,
  updateCompanySurfaceColorsAction,
  uploadBackgroundImageAction,
} from '@/app/action'
import { ImageAttachmentField } from '@/components/admin/image-attachment-field'
import { usePersonalization } from '@/components/personalization-provider'
import { useTheme } from '@/components/theme-provider'
import { ColorPickerField } from '@/components/ui/color-picker-field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  ACCENT_COLOR_PRESETS,
  SURFACE_COLOR_DEFAULTS,
  normalizeHexColor,
  resolveBackgroundMode,
  resolveColorForTheme,
  surfaceColorForStorage,
  type BackgroundMode,
} from '@/lib/personalization'
import {
  PROFILE_IMAGE_MAX_SIZE_LABEL,
  profileImageIdleDescription,
} from '@/lib/profile-image-upload'
import { cn } from '@/lib/utils'
import { ImageIcon, Layers, Palette } from 'lucide-react'
import { toast } from 'sonner'

interface PersonalizationSettingsProps {
  embedded?: boolean
  initialAccentColor?: string | null
  initialBackgroundUrl?: string | null
  /** When false, shows company branding read-only for non-admin staff. */
  canEdit?: boolean
}

function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number
) {
  const fnRef = useRef(fn)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  fnRef.current = fn

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        fnRef.current(...args)
      }, delayMs)
    },
    [delayMs]
  )
}

function BrandingCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border bg-card/40 shadow-sm">
      <div className="flex items-start gap-3 border-b px-4 py-3.5 sm:px-5">
        <div className="shrink-0 rounded-md bg-muted p-2">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function PersonalizationSettings({
  embedded = false,
  initialAccentColor = null,
  initialBackgroundUrl = null,
  canEdit = true,
}: PersonalizationSettingsProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const {
    accentColor,
    backgroundImageUrl,
    backgroundColor,
    cardColor,
    textColor,
    setAccentColor,
    setBackgroundImageUrl,
    setBackgroundColor,
    setCardColor,
    setTextColor,
  } = usePersonalization()

  const [selectedAccent, setSelectedAccent] = useState<string | null>(
    initialAccentColor ?? accentColor
  )
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(
    initialBackgroundUrl ?? backgroundImageUrl
  )
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(() =>
    resolveBackgroundMode({
      backgroundImageUrl: initialBackgroundUrl ?? backgroundImageUrl,
      backgroundColor,
    })
  )
  const [isUploadingBackground, setIsUploadingBackground] = useState(false)
  const [isSavingAccent, setIsSavingAccent] = useState(false)
  const [backgroundError, setBackgroundError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedAccent(accentColor)
    setBackgroundPreview(backgroundImageUrl)
    setBackgroundMode(
      resolveBackgroundMode({ backgroundImageUrl, backgroundColor })
    )
  }, [accentColor, backgroundImageUrl, backgroundColor])

  const persistAccent = async (hex: string | null) => {
    setIsSavingAccent(true)
    const result = await updateAccentColorAction(hex)
    setIsSavingAccent(false)

    if (!result.success) {
      toast.error(result.error || 'Failed to save primary color')
      return false
    }

    setAccentColor(hex)
    return true
  }

  const persistSurface = useDebouncedCallback(
    async (patch: {
      cardColor?: string | null
      textColor?: string | null
      backgroundColor?: string | null
    }) => {
      if (!canEdit) return
      const result = await updateCompanySurfaceColorsAction(patch)
      if (!result.success) {
        toast.error(result.error || 'Failed to save appearance')
      }
    },
    450
  )

  const persistAccentDebounced = useDebouncedCallback((hex: string) => {
    void persistAccent(hex)
  }, 450)

  const handlePresetSelect = async (hex: string) => {
    setSelectedAccent(hex)
    setAccentColor(hex)
    const ok = await persistAccent(hex)
    if (ok) toast.success('Primary color updated')
  }

  const handleAccentPickerChange = (hex: string) => {
    setSelectedAccent(hex)
    setAccentColor(hex)
    persistAccentDebounced(hex)
  }

  const handleResetAccent = async () => {
    setSelectedAccent(null)
    const ok = await persistAccent(null)
    if (ok) toast.success('Primary color reset')
  }

  const handleCardChange = (hex: string) => {
    // Store dark-mode half of the pair; light mode applies the inverse automatically.
    const stored = surfaceColorForStorage(hex, isDark) ?? hex
    setCardColor(stored)
    persistSurface({ cardColor: stored })
  }

  const handleTextChange = (hex: string) => {
    setTextColor(hex)
    persistSurface({ textColor: hex })
  }

  const handleResetCard = async () => {
    setCardColor(null)
    const result = await updateCompanySurfaceColorsAction({ cardColor: null })
    if (result.success) toast.success('Card color reset')
    else toast.error(result.error || 'Failed to reset card color')
  }

  const handleResetText = async () => {
    setTextColor(null)
    const result = await updateCompanySurfaceColorsAction({ textColor: null })
    if (result.success) toast.success('Text color reset')
    else toast.error(result.error || 'Failed to reset text color')
  }

  const handleBackgroundModeChange = async (mode: BackgroundMode) => {
    if (!canEdit) return
    setBackgroundMode(mode)
    setBackgroundError(null)

    if (mode === 'default') {
      setIsUploadingBackground(true)
      if (backgroundImageUrl || backgroundPreview) {
        await removeBackgroundImageAction()
      }
      const result = await updateCompanySurfaceColorsAction({
        backgroundColor: null,
      })
      setIsUploadingBackground(false)
      setBackgroundPreview(null)
      setBackgroundImageUrl(null)
      setBackgroundColor(null)
      if (!result.success) {
        toast.error(result.error || 'Failed to reset background')
        return
      }
      toast.success('Background reset to theme default')
      return
    }

    if (mode === 'solid') {
      if (backgroundImageUrl || backgroundPreview) {
        setIsUploadingBackground(true)
        await removeBackgroundImageAction()
        setIsUploadingBackground(false)
        setBackgroundPreview(null)
        setBackgroundImageUrl(null)
      }
      const nextSolid =
        backgroundColor ||
        (isDark
          ? SURFACE_COLOR_DEFAULTS.backgroundDark
          : SURFACE_COLOR_DEFAULTS.backgroundLight)
      const storedSolid = surfaceColorForStorage(nextSolid, isDark) ?? nextSolid
      setBackgroundColor(storedSolid)
      const result = await updateCompanySurfaceColorsAction({
        backgroundColor: storedSolid,
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to set solid background')
        return
      }
      toast.success('Solid background enabled')
      return
    }

    if (backgroundColor) {
      setBackgroundColor(null)
      const result = await updateCompanySurfaceColorsAction({
        backgroundColor: null,
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to switch to photo background')
      }
    }
  }

  const handleSolidBackgroundChange = (hex: string) => {
    const stored = surfaceColorForStorage(hex, isDark) ?? hex
    setBackgroundMode('solid')
    setBackgroundColor(stored)
    setBackgroundPreview(null)
    setBackgroundImageUrl(null)
    persistSurface({ backgroundColor: stored })
  }

  const handleBackgroundSelect = async (file: File) => {
    const localPreview = URL.createObjectURL(file)
    setBackgroundPreview(localPreview)
    setBackgroundMode('image')
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
      setBackgroundColor(null)
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
      setBackgroundMode(backgroundColor ? 'solid' : 'default')
      toast.success('Background image removed')
    } else {
      setBackgroundError(result.error || 'Failed to remove background')
      toast.error(result.error || 'Failed to remove background')
    }
  }

  const cardFallback = isDark
    ? SURFACE_COLOR_DEFAULTS.cardDark
    : SURFACE_COLOR_DEFAULTS.cardLight
  const textFallback = isDark
    ? SURFACE_COLOR_DEFAULTS.textDark
    : SURFACE_COLOR_DEFAULTS.textLight
  const bgFallback = isDark
    ? SURFACE_COLOR_DEFAULTS.backgroundDark
    : SURFACE_COLOR_DEFAULTS.backgroundLight

  // Show the theme-resolved value so pickers reflect light/dark inversion.
  const displayCardColor = cardColor
    ? resolveColorForTheme(cardColor, isDark, 'surface')
    : null
  const displayTextColor = textColor
    ? resolveColorForTheme(textColor, isDark, 'text')
    : null
  const displayBackgroundColor = backgroundColor
    ? resolveColorForTheme(backgroundColor, isDark, 'surface')
    : null

  const content = (
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Only company admins can edit these. Changes apply to your whole team and the client
          portal.
        </p>
      )}

      <BrandingCard
        icon={Palette}
        title="Brand color"
        description="Primary buttons, links, and highlights."
      >
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Quick picks</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {ACCENT_COLOR_PRESETS.map((preset) => {
                const selected = selectedAccent === preset.hex
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.label}
                    aria-label={`${preset.label} primary`}
                    disabled={!canEdit || isSavingAccent}
                    onClick={() => void handlePresetSelect(preset.hex)}
                    className={cn(
                      'size-9 rounded-md border-2 transition-transform hover:scale-105',
                      selected
                        ? 'border-foreground ring-2 ring-ring/40'
                        : 'border-transparent'
                    )}
                    style={{ backgroundColor: preset.hex }}
                  />
                )
              })}
            </div>
          </div>

          <ColorPickerField
            layout="inline"
            label="Custom primary"
            description="Any brand hue"
            value={selectedAccent}
            fallbackHex={
              normalizeHexColor(selectedAccent) || SURFACE_COLOR_DEFAULTS.accent
            }
            disabled={!canEdit || isSavingAccent}
            onChange={handleAccentPickerChange}
            onReset={() => void handleResetAccent()}
            resetDisabled={!selectedAccent}
            resetLabel="Reset"
          />
        </div>
      </BrandingCard>

      <BrandingCard
        icon={Layers}
        title="Surfaces & text"
        description="Cards and body text. A pick in one mode stores a pair — the other mode uses the inverse."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorPickerField
            layout="inline"
            label="Card color"
            description="Cards, panels, and inset chrome"
            value={displayCardColor}
            fallbackHex={cardFallback}
            disabled={!canEdit}
            onChange={handleCardChange}
            onReset={() => void handleResetCard()}
            resetDisabled={!cardColor}
          />
          <ColorPickerField
            layout="inline"
            label="Text color"
            description="Headings and body copy"
            value={displayTextColor}
            fallbackHex={textFallback}
            disabled={!canEdit}
            onChange={handleTextChange}
            onReset={() => void handleResetText()}
            resetDisabled={!textColor}
          />
        </div>
      </BrandingCard>

      <BrandingCard
        icon={ImageIcon}
        title="Background"
        description="App canvas for everyone. Solid colors also invert between light and dark mode."
      >
        <RadioGroup
          value={backgroundMode}
          onValueChange={(value) => {
            if (!canEdit || isUploadingBackground) return
            if (value === 'default' || value === 'solid' || value === 'image') {
              void handleBackgroundModeChange(value)
            }
          }}
          className="grid gap-2 sm:grid-cols-3"
        >
          {(
            [
              {
                id: 'default' as const,
                label: 'Theme default',
                hint: 'Matches light / dark',
              },
              {
                id: 'solid' as const,
                label: 'Solid color',
                hint: 'Custom canvas color',
              },
              {
                id: 'image' as const,
                label: 'Photo',
                hint: 'Full-app wallpaper',
              },
            ] as const
          ).map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors',
                backgroundMode === option.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/40',
                (!canEdit || isUploadingBackground) && 'pointer-events-none opacity-60'
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <RadioGroupItem
                  value={option.id}
                  disabled={!canEdit || isUploadingBackground}
                />
                {option.label}
              </span>
              <span className="pl-6 text-[11px] text-muted-foreground">{option.hint}</span>
            </label>
          ))}
        </RadioGroup>

        {backgroundMode === 'solid' ? (
          <ColorPickerField
            layout="inline"
            label="Background color"
            description="App canvas behind cards"
            value={displayBackgroundColor}
            fallbackHex={bgFallback}
            disabled={!canEdit}
            onChange={handleSolidBackgroundChange}
          />
        ) : null}

        {backgroundMode === 'image' ? (
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
                ? `Landscape works best · JPG, PNG, or WebP · max ${PROFILE_IMAGE_MAX_SIZE_LABEL}`
                : 'Ask your company admin to update this in Settings → Appearance.'
            }
            mediaClassName="!w-full !h-28 min-w-full"
          />
        ) : null}

        {backgroundMode === 'default' ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Using the built-in light or dark canvas. No custom color or photo is applied.
          </p>
        ) : null}
      </BrandingCard>
    </div>
  )

  if (embedded) return content

  return <div className="rounded-lg border bg-card/50 p-4">{content}</div>
}
