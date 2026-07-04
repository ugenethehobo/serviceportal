'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/components/theme-provider'
import { Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { updateUserThemeAction } from '@/app/action'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { ThemePreference } from '@/lib/theme'

interface AppearanceSettingsProps {
  embedded?: boolean
}

export function AppearanceSettings({ embedded = false }: AppearanceSettingsProps) {
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
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Appearance</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose light or dark mode. Your preference is saved to your profile and applies across
            the dashboard, client portal, and admin.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 text-muted-foreground">
              {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </div>
            <div>
              <Label htmlFor="dark-mode-toggle" className="text-sm font-medium">
                Dark mode
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isDark ? 'Dark theme is enabled' : 'Light theme is enabled'}
              </p>
            </div>
          </div>
          <Switch
            id="dark-mode-toggle"
            checked={isDark}
            onCheckedChange={handleToggle}
            disabled={!isMounted || isSaving}
          />
      </div>
    </div>
  )

  if (embedded) return content

  return <Card className="p-6">{content}</Card>
}