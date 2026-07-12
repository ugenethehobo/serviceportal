'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  getCompanyIntegrationsAction,
  listGoogleCalendarsAction,
  saveGoogleCalendarSettingsAction,
  saveZapierIntegrationAction,
  testZapierIntegrationAction,
} from '@/app/action'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  INTEGRATION_PROVIDERS,
  QUICKBOOKS_INTEGRATION_ENABLED,
  ZAPIER_EVENT_LABELS,
  ZAPIER_EVENT_TYPES,
  type IntegrationProvider,
  type IntegrationRecord,
  type ZapierEventType,
} from '@/lib/integrations'
import { getGoogleCalendarSyncSettings } from '@/lib/google-calendar-oauth'
import { getQuickBooksRealmId } from '@/lib/quickbooks-oauth'
import { cn } from '@/lib/utils'
import { Calendar, Link2, Loader2, Webhook } from 'lucide-react'
import { toast } from 'sonner'

const PROVIDER_ICONS: Record<IntegrationProvider, typeof Link2> = {
  quickbooks: Link2,
  google_calendar: Calendar,
  zapier: Webhook,
}

export function IntegrationsSettings() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([])
  const [zapierUrl, setZapierUrl] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isConnectingQuickBooks, setIsConnectingQuickBooks] = useState(false)
  const [isDisconnectingQuickBooks, setIsDisconnectingQuickBooks] = useState(false)
  const [isConnectingGoogleCalendar, setIsConnectingGoogleCalendar] = useState(false)
  const [isDisconnectingGoogleCalendar, setIsDisconnectingGoogleCalendar] = useState(false)
  const [isSavingGoogleCalendar, setIsSavingGoogleCalendar] = useState(false)
  const [isLoadingGoogleCalendars, setIsLoadingGoogleCalendars] = useState(false)
  const [googleSyncEnabled, setGoogleSyncEnabled] = useState(false)
  const [googleCalendarId, setGoogleCalendarId] = useState('')
  const [googleCalendars, setGoogleCalendars] = useState<
    Array<{ id: string; summary: string; primary?: boolean }>
  >([])
  const [testEvent, setTestEvent] = useState<ZapierEventType>('invoice_sent')

  const load = useCallback(async () => {
    setIsLoading(true)
    const result = await getCompanyIntegrationsAction()
    if (result.success) {
      setIntegrations(result.integrations)
      const zapier = result.integrations.find((row) => row.provider === 'zapier')
      setZapierUrl(
        typeof zapier?.config.webhook_url === 'string' ? zapier.config.webhook_url : ''
      )

      const google = result.integrations.find((row) => row.provider === 'google_calendar')
      const googleSettings = getGoogleCalendarSyncSettings(google?.config || {})
      setGoogleSyncEnabled(googleSettings.sync_enabled)
      setGoogleCalendarId(googleSettings.calendar_id || '')
    } else {
      toast.error(result.error || 'Failed to load integrations')
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const quickbooksParam = searchParams.get('quickbooks')
    const googleCalendarParam = searchParams.get('google_calendar')
    if (!quickbooksParam && !googleCalendarParam) return

    const message = searchParams.get('message')

    if (quickbooksParam && QUICKBOOKS_INTEGRATION_ENABLED) {
      if (quickbooksParam === 'connected') {
        toast.success('QuickBooks connected successfully')
        void load()
      } else if (quickbooksParam === 'error') {
        toast.error(message || 'QuickBooks connection failed')
      }
    }

    if (googleCalendarParam === 'connected') {
      toast.success('Google Calendar connected successfully')
      void load()
    } else if (googleCalendarParam === 'error') {
      toast.error(message || 'Google Calendar connection failed')
    }

    const params = new URLSearchParams(searchParams.toString())
    params.delete('quickbooks')
    params.delete('google_calendar')
    params.delete('message')
    const query = params.toString()
    router.replace(query ? `/dashboard/settings?${query}` : '/dashboard/settings')
  }, [searchParams, router, load])

  const getRecord = (provider: IntegrationProvider) =>
    integrations.find((row) => row.provider === provider)

  const saveZapier = async () => {
    setIsSaving(true)
    const result = await saveZapierIntegrationAction(zapierUrl)
    if (result.success) {
      toast.success('Zapier webhook saved')
      await load()
    } else {
      toast.error(result.error || 'Failed to save Zapier webhook')
    }
    setIsSaving(false)
  }

  const testZapier = async () => {
    setIsTesting(true)
    const result = await testZapierIntegrationAction(testEvent)
    if (result.success) {
      toast.success(`Test "${ZAPIER_EVENT_LABELS[testEvent]}" event sent`)
    } else {
      toast.error(result.error || 'Test failed')
    }
    setIsTesting(false)
  }

  const connectQuickBooks = async () => {
    setIsConnectingQuickBooks(true)
    try {
      const res = await fetch('/api/integrations/quickbooks/connect', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      toast.error(data.error || 'Failed to start QuickBooks connection')
    } catch {
      toast.error('Failed to start QuickBooks connection')
    } finally {
      setIsConnectingQuickBooks(false)
    }
  }

  const connectGoogleCalendar = async () => {
    setIsConnectingGoogleCalendar(true)
    try {
      const res = await fetch('/api/integrations/google-calendar/connect', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      toast.error(data.error || 'Failed to start Google Calendar connection')
    } catch {
      toast.error('Failed to start Google Calendar connection')
    } finally {
      setIsConnectingGoogleCalendar(false)
    }
  }

  const disconnectGoogleCalendar = async () => {
    setIsDisconnectingGoogleCalendar(true)
    try {
      const res = await fetch('/api/integrations/google-calendar/disconnect', {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Google Calendar disconnected')
        setGoogleSyncEnabled(false)
        setGoogleCalendarId('')
        setGoogleCalendars([])
        await load()
      } else {
        toast.error(data.error || 'Failed to disconnect Google Calendar')
      }
    } catch {
      toast.error('Failed to disconnect Google Calendar')
    } finally {
      setIsDisconnectingGoogleCalendar(false)
    }
  }

  const loadGoogleCalendars = async () => {
    setIsLoadingGoogleCalendars(true)
    const result = await listGoogleCalendarsAction()
    if (result.success) {
      setGoogleCalendars(result.calendars)
      if (!googleCalendarId && result.calendars.length > 0) {
        const primary = result.calendars.find((calendar) => calendar.primary)
        setGoogleCalendarId(primary?.id || result.calendars[0].id)
      }
    } else {
      toast.error(result.error || 'Failed to load calendars')
    }
    setIsLoadingGoogleCalendars(false)
  }

  const saveGoogleCalendarSettings = async () => {
    setIsSavingGoogleCalendar(true)
    const selected = googleCalendars.find((calendar) => calendar.id === googleCalendarId)
    const result = await saveGoogleCalendarSettingsAction({
      syncEnabled: googleSyncEnabled,
      calendarId: googleCalendarId || null,
      calendarSummary: selected?.summary || null,
    })
    if (result.success) {
      toast.success('Google Calendar settings saved')
      await load()
    } else {
      toast.error(result.error || 'Failed to save Google Calendar settings')
    }
    setIsSavingGoogleCalendar(false)
  }

  const disconnectQuickBooks = async () => {
    setIsDisconnectingQuickBooks(true)
    try {
      const res = await fetch('/api/integrations/quickbooks/disconnect', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success('QuickBooks disconnected')
        await load()
      } else {
        toast.error(data.error || 'Failed to disconnect QuickBooks')
      }
    } catch {
      toast.error('Failed to disconnect QuickBooks')
    } finally {
      setIsDisconnectingQuickBooks(false)
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading integrations...</p>
  }

  return (
    <div className="space-y-4">
      {(['quickbooks', 'google_calendar', 'zapier'] as IntegrationProvider[]).map((provider) => {
        const meta = INTEGRATION_PROVIDERS[provider]
        const record = getRecord(provider)
        const Icon = PROVIDER_ICONS[provider]
        const status = record?.status || 'disconnected'
        const quickbooksRealmId =
          provider === 'quickbooks' && record?.config
            ? getQuickBooksRealmId(record.config)
            : null

        const quickbooksDisabled = provider === 'quickbooks' && !QUICKBOOKS_INTEGRATION_ENABLED

        return (
          <Card
            key={provider}
            className={cn('p-5 shadow-sm', quickbooksDisabled && 'opacity-80')}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border p-2 text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div>
                  <h3 className="font-semibold">{meta.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{meta.description}</p>
                </div>
              </div>
              <Badge
                variant={
                  quickbooksDisabled
                    ? 'secondary'
                    : status === 'connected'
                      ? 'default'
                      : status === 'error'
                        ? 'destructive'
                        : 'outline'
                }
              >
                {quickbooksDisabled
                  ? 'Coming soon'
                  : status === 'connected'
                    ? 'Connected'
                    : status === 'error'
                      ? 'Error'
                      : 'Not connected'}
              </Badge>
            </div>

            {provider === 'quickbooks' ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {QUICKBOOKS_INTEGRATION_ENABLED
                    ? 'Connect your QuickBooks Online company to prepare for invoice and payment sync. Full two-way sync ships in a later release — this step only stores OAuth access.'
                    : 'QuickBooks Online sync is on the roadmap. Invoice and payment sync will be available in a future update.'}
                </p>
                {QUICKBOOKS_INTEGRATION_ENABLED && status === 'connected' && quickbooksRealmId && (
                  <p className="text-xs text-muted-foreground">
                    QuickBooks company ID: <span className="font-mono">{quickbooksRealmId}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {QUICKBOOKS_INTEGRATION_ENABLED ? (
                    status === 'connected' ? (
                      <Button
                        variant="outline"
                        onClick={() => void disconnectQuickBooks()}
                        disabled={isDisconnectingQuickBooks}
                      >
                        {isDisconnectingQuickBooks && <Loader2 className="size-4 animate-spin" />}
                        Disconnect QuickBooks
                      </Button>
                    ) : (
                      <Button
                        onClick={() => void connectQuickBooks()}
                        disabled={isConnectingQuickBooks}
                      >
                        {isConnectingQuickBooks && <Loader2 className="size-4 animate-spin" />}
                        Connect QuickBooks
                      </Button>
                    )
                  ) : (
                    <Button disabled>Connect QuickBooks</Button>
                  )}
                </div>
              </div>
            ) : provider === 'google_calendar' ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Connect Google Calendar to export scheduled and in-progress jobs one-way.
                  Updates, cancellations, and archives remove or refresh the linked calendar
                  event automatically.
                </p>
                <div className="flex flex-wrap gap-2">
                  {status === 'connected' ? (
                    <Button
                      variant="outline"
                      onClick={() => void disconnectGoogleCalendar()}
                      disabled={isDisconnectingGoogleCalendar}
                    >
                      {isDisconnectingGoogleCalendar && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                      Disconnect Google Calendar
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void connectGoogleCalendar()}
                      disabled={isConnectingGoogleCalendar}
                    >
                      {isConnectingGoogleCalendar && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                      Connect Google Calendar
                    </Button>
                  )}
                </div>

                {status === 'connected' ? (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label htmlFor="google-sync-enabled">Export jobs to Google Calendar</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          New and updated jobs sync when this is enabled.
                        </p>
                      </div>
                      <Switch
                        id="google-sync-enabled"
                        checked={googleSyncEnabled}
                        onCheckedChange={setGoogleSyncEnabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="google-calendar-id">Target calendar</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={googleCalendarId || undefined}
                          onValueChange={(value) => setGoogleCalendarId(value || '')}
                          disabled={googleCalendars.length === 0}
                        >
                          <SelectTrigger id="google-calendar-id" className="min-w-[240px] max-md:w-full max-md:min-w-0">
                            <SelectValue placeholder="Choose a calendar" />
                          </SelectTrigger>
                          <SelectContent>
                            {googleCalendars.map((calendar) => (
                              <SelectItem key={calendar.id} value={calendar.id}>
                                {calendar.summary}
                                {calendar.primary ? ' (Primary)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void loadGoogleCalendars()}
                          disabled={isLoadingGoogleCalendars}
                        >
                          {isLoadingGoogleCalendars && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          Load calendars
                        </Button>
                      </div>
                    </div>

                    <Button
                      onClick={() => void saveGoogleCalendarSettings()}
                      disabled={isSavingGoogleCalendar}
                    >
                      {isSavingGoogleCalendar && <Loader2 className="size-4 animate-spin" />}
                      Save Google Calendar settings
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : provider === 'zapier' ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  When something happens in ServicePortal (invoice sent, payment recorded, etc.),
                  we POST a JSON payload to your webhook URL. In Zapier, create a Zap with trigger
                  &quot;Webhooks by Zapier → Catch Hook&quot; and paste that URL here. No Zapier
                  account? Use a free inspector like{' '}
                  <a
                    href="https://webhook.site"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    webhook.site
                  </a>{' '}
                  to see test payloads.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="zapier-webhook">Webhook URL</Label>
                  <Input
                    id="zapier-webhook"
                    value={zapierUrl}
                    onChange={(e) => setZapierUrl(e.target.value)}
                    placeholder="https://hooks.zapier.com/hooks/catch/..."
                  />
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {ZAPIER_EVENT_TYPES.map((eventType) => (
                    <li key={eventType}>
                      <span className="font-medium text-foreground">{eventType}</span>
                      {' — '}
                      {ZAPIER_EVENT_LABELS[eventType]}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-end gap-2">
                  <Button onClick={() => void saveZapier()} disabled={isSaving}>
                    {isSaving && <Loader2 className="size-4 animate-spin" />}
                    Save webhook
                  </Button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={testEvent}
                      onValueChange={(value) => setTestEvent(value as ZapierEventType)}
                    >
                      <SelectTrigger className="h-9 w-[200px] max-md:w-full max-md:min-w-0">
                        <SelectValue placeholder="Test event" />
                      </SelectTrigger>
                      <SelectContent>
                        {ZAPIER_EVENT_TYPES.map((eventType) => (
                          <SelectItem key={eventType} value={eventType}>
                            {ZAPIER_EVENT_LABELS[eventType]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={() => void testZapier()}
                      disabled={isTesting || !zapierUrl.trim()}
                    >
                      {isTesting && <Loader2 className="size-4 animate-spin" />}
                      Send test
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}