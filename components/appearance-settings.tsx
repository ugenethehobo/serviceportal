'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useTheme } from '@/components/theme-provider'
import { Moon, Sun, User } from 'lucide-react'
import { toast } from 'sonner'
import { updateUserThemeAction } from '@/app/action'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PersonalizationSettings } from '@/components/personalization-settings'
import type { ThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'

interface AppearanceSettingsProps {
  embedded?: boolean
  initialAccentColor?: string | null
  initialBackgroundUrl?: string | null
  /** Company admins can edit shared branding; others only change their theme. */
  canEditCompanyBranding?: boolean
  /**
   * When false, hide company accent/background controls entirely
   * (e.g. client portal — clients should not see company branding settings).
   */
  showCompanyBranding?: boolean
}

function AppearanceGroup({
  icon: Icon,
  title,
  description,
  badge,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  badge?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border bg-card/40 shadow-sm', className)}>
      <div className="flex items-start gap-3 border-b px-4 py-3.5 sm:px-5">
        <div className="rounded-md bg-muted p-2 shrink-0">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            {badge ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function AppearanceSettings({
  embedded = false,
  initialAccentColor = null,
  initialBackgroundUrl = null,
  canEditCompanyBranding = true,
  showCompanyBranding = true,
}: AppearanceSettingsProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const isDark = isMounted && resolvedTheme === 'dark'

  const handleToggle = async (checked: boolean) => {
    const nextTheme: ThemePreference = checked ? 'dark' : 'light'
    const previousTheme: ThemePreference = checked ? 'light' : 'dark'

    setTheme(nextTheme)
    setIsSaving(true)

    const result = await updateUserThemeAction(nextTheme)
    setIsSaving(false)

    if (!result.success) {
      setTheme(previousTheme)
      toast.error(result.error || 'Failed to save theme preference')
    }
  }

  const content = (
    <div className="space-y-5">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your theme is personal. Company look is shared with your team and client portal.
          </p>
        </div>
      )}

      <AppearanceGroup
        icon={isDark ? Moon : Sun}
        title="Your theme"
        description="Light or dark mode for your account only."
        badge="Personal"
      >
        <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/60 px-3.5 py-3">
          <div className="min-w-0">
            <Label htmlFor="dark-mode-toggle" className="text-sm font-medium">
              Dark mode
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isDark ? 'Dark theme is on for you' : 'Light theme is on for you'}
            </p>
          </div>
          <Switch
            id="dark-mode-toggle"
            checked={isDark}
            onCheckedChange={handleToggle}
            disabled={!isMounted || isSaving}
          />
        </div>
      </AppearanceGroup>

      {showCompanyBranding ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-0.5">
            <User className="size-3.5 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Company look
            </p>
          </div>
          <PersonalizationSettings
            embedded
            initialAccentColor={initialAccentColor}
            initialBackgroundUrl={initialBackgroundUrl}
            canEdit={canEditCompanyBranding}
          />
        </div>
      ) : null}
    </div>
  )

  if (embedded) return content

  return <Card className="p-6">{content}</Card>
}
