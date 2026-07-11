'use client'

import { useEffect, useState } from 'react'
import {
  getPlatformReleaseSettingsAction,
  updatePlatformReleaseModeAction,
  updatePlatformReleaseScheduleAction,
} from '@/app/action'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DateTimePicker } from '@/components/ui/datetime-picker'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  datetimeLocalToIso,
  formatScheduledReleaseLabel,
  isoToDatetimeLocal,
} from '@/lib/platform-release-schedule'
import type { PlatformReleaseMode } from '@/lib/platform-settings'
import { CalendarClock, Loader2, Rocket, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

type PlatformReleaseModePanelProps = {
  initialMode: PlatformReleaseMode
}

export function PlatformReleaseModePanel({ initialMode }: PlatformReleaseModePanelProps) {
  const [mode, setMode] = useState<PlatformReleaseMode>(initialMode)
  const [scheduledLocal, setScheduledLocal] = useState('')
  const [savedScheduledAt, setSavedScheduledAt] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)

  const isBeta = mode === 'beta'
  const scheduleDirty =
    datetimeLocalToIso(scheduledLocal) !== savedScheduledAt &&
    (scheduledLocal !== '' || savedScheduledAt !== null)

  const loadSettings = async () => {
    const result = await getPlatformReleaseSettingsAction()
    if (result.success) {
      setMode(result.releaseMode)
      setSavedScheduledAt(result.scheduledReleaseAt)
      setScheduledLocal(isoToDatetimeLocal(result.scheduledReleaseAt))
    }
    return result
  }

  useEffect(() => {
    void loadSettings()
  }, [])

  const handleToggle = async (checked: boolean) => {
    const nextMode: PlatformReleaseMode = checked ? 'beta' : 'release'
    setIsSaving(true)
    const result = await updatePlatformReleaseModeAction(nextMode)
    setIsSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setMode(nextMode)
    toast.success(
      nextMode === 'beta'
        ? 'Beta mode enabled — free trial hidden on marketing site'
        : 'Full release mode enabled — free trial is live'
    )
  }

  const handleRefresh = async () => {
    setIsSaving(true)
    const result = await loadSettings()
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error)
    }
  }

  const handleSaveSchedule = async () => {
    setIsSavingSchedule(true)
    const iso = datetimeLocalToIso(scheduledLocal)
    if (scheduledLocal && !iso) {
      setIsSavingSchedule(false)
      toast.error('Enter a valid date and time')
      return
    }

    const result = await updatePlatformReleaseScheduleAction(iso)
    setIsSavingSchedule(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setSavedScheduledAt(iso)
    toast.success(
      iso
        ? `Scheduled automatic launch for ${formatScheduledReleaseLabel(iso)}`
        : 'Automatic launch schedule cleared'
    )
  }

  const handleClearSchedule = async () => {
    setIsSavingSchedule(true)
    const result = await updatePlatformReleaseScheduleAction(null)
    setIsSavingSchedule(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setScheduledLocal('')
    setSavedScheduledAt(null)
    toast.success('Automatic launch schedule cleared')
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Release mode</h2>
            <Badge variant={isBeta ? 'default' : 'secondary'}>
              {isBeta ? 'Beta' : 'Full release'}
            </Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isBeta
              ? 'Marketing site shows beta access requests, hides the free trial, and signup uses beta access codes (Pro tier).'
              : 'Marketing site shows the free trial and standard promo codes at checkout.'}
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            {isBeta ? (
              <Sparkles className="size-4 text-amber-600" />
            ) : (
              <Rocket className="size-4 text-emerald-600" />
            )}
            <Label htmlFor="platform-release-mode" className="font-medium">
              Beta mode
            </Label>
          </div>
          <Switch
            id="platform-release-mode"
            checked={isBeta}
            disabled={isSaving}
            onCheckedChange={(checked) => void handleToggle(checked)}
          />
          {isSaving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      <div className="mt-6 space-y-3 border-t pt-5">
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Automatic launch</h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Schedule when the product switches to full release. One month before this date,
              unpaid accounts see a subtle sidebar reminder to subscribe. At the scheduled time,
              beta mode turns off and complimentary access ends for companies without a paid
              subscription.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:max-w-md">
          <div className="space-y-2">
            <Label htmlFor="scheduled-release-at">Launch date & time</Label>
            <DateTimePicker
              id="scheduled-release-at"
              value={scheduledLocal}
              onChange={setScheduledLocal}
              disabled={isSavingSchedule}
              placeholder="No automatic launch scheduled"
            />
          </div>

          {savedScheduledAt && (
            <p className="text-xs text-muted-foreground">
              Saved: {formatScheduledReleaseLabel(savedScheduledAt)}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSaveSchedule()}
              disabled={isSavingSchedule || !scheduleDirty}
            >
              {isSavingSchedule ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save schedule'
              )}
            </Button>
            {savedScheduledAt && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleClearSchedule()}
                disabled={isSavingSchedule}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={isSaving}
        >
          Refresh
        </Button>
      </div>
    </Card>
  )
}