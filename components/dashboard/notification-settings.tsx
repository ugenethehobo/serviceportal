'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getNotificationSettingsAction,
  updateNotificationSettingsAction,
} from '@/app/action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  NOTIFICATION_EVENT_LABELS,
  type NotificationEvent,
  type NotificationPreferences,
} from '@/lib/notifications'
import { toast } from 'sonner'
import { Bell, Mail, MessageSquare } from 'lucide-react'

const EVENT_ORDER: NotificationEvent[] = [
  'message_from_staff',
  'message_from_client',
  'estimate_sent',
  'estimate_response',
  'payment_received',
  'lead_follow_up_due',
]

interface NotificationSettingsProps {
  embedded?: boolean
}

export function NotificationSettings({ embedded = false }: NotificationSettingsProps = {}) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    const result = await getNotificationSettingsAction()
    if (result.success) {
      setPreferences(result.preferences)
    } else {
      toast.error(result.error || 'Failed to load notification settings')
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const updatePreference = (
    updater: (current: NotificationPreferences) => NotificationPreferences
  ) => {
    setPreferences((current) => (current ? updater(current) : current))
  }

  const handleSave = async () => {
    if (!preferences) return
    setIsSaving(true)
    const result = await updateNotificationSettingsAction(preferences)
    if (result.success) {
      toast.success('Notification settings saved')
    } else {
      toast.error(result.error || 'Failed to save notification settings')
    }
    setIsSaving(false)
  }

  if (isLoading || !preferences) {
    return <p className="text-sm text-muted-foreground">Loading notification settings…</p>
  }

  const content = (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-muted p-2 shrink-0">
          <Bell className="size-4 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold tracking-tight">Notifications</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Email uses Resend. SMS uses Textbelt&apos;s free tier (1 text/day with the default key,
            or create your own key at textbelt.com).
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground space-y-1">
        <p>
          <strong className="text-foreground">Email:</strong> set <code>RESEND_API_KEY</code> and{' '}
          <code>RESEND_FROM_EMAIL</code> in your environment.
        </p>
        <p>
          <strong className="text-foreground">SMS:</strong> optional <code>TEXTBELT_API_KEY</code>{' '}
          (defaults to the free <code>textbelt</code> key).
        </p>
        <p>
          <strong className="text-foreground">Follow-up reminders:</strong> schedule a daily call to{' '}
          <code>/api/cron/notifications</code> with your <code>CRON_SECRET</code>.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            <Label htmlFor="email-enabled">Email notifications</Label>
          </div>
          <Switch
            id="email-enabled"
            checked={preferences.email_enabled}
            onCheckedChange={(checked) =>
              updatePreference((current) => ({ ...current, email_enabled: checked }))
            }
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-muted-foreground" />
            <Label htmlFor="sms-enabled">SMS notifications</Label>
          </div>
          <Switch
            id="sms-enabled"
            checked={preferences.sms_enabled}
            onCheckedChange={(checked) =>
              updatePreference((current) => ({ ...current, sms_enabled: checked }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reply-to-email">Reply-to email (optional)</Label>
          <Input
            id="reply-to-email"
            type="email"
            value={preferences.reply_to_email || ''}
            onChange={(event) =>
              updatePreference((current) => ({
                ...current,
                reply_to_email: event.target.value.trim() || null,
              }))
            }
            placeholder="office@yourcompany.com"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Per-event delivery</Label>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-3 font-medium">Event</th>
                <th className="text-center p-3 font-medium w-20">Email</th>
                <th className="text-center p-3 font-medium w-20">SMS</th>
              </tr>
            </thead>
            <tbody>
              {EVENT_ORDER.map((event) => {
                const eventPrefs = preferences.events[event] || {}
                return (
                  <tr key={event} className="border-t">
                    <td className="p-3">{NOTIFICATION_EVENT_LABELS[event]}</td>
                    <td className="p-3 text-center">
                      <Switch
                        checked={!!eventPrefs.email}
                        disabled={!preferences.email_enabled}
                        onCheckedChange={(checked) =>
                          updatePreference((current) => ({
                            ...current,
                            events: {
                              ...current.events,
                              [event]: { ...current.events[event], email: checked },
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="p-3 text-center">
                      <Switch
                        checked={!!eventPrefs.sms}
                        disabled={!preferences.sms_enabled}
                        onCheckedChange={(checked) =>
                          updatePreference((current) => ({
                            ...current,
                            events: {
                              ...current.events,
                              [event]: { ...current.events[event], sms: checked },
                            },
                          }))
                        }
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Button type="button" onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save notification settings'}
      </Button>
    </div>
  )

  if (embedded) return content
  return <section className="rounded-lg border bg-card/50 p-4">{content}</section>
}