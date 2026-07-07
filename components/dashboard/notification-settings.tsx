'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getNotificationSettingsAction,
  updateNotificationSettingsAction,
} from '@/app/action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import {
  NOTIFICATION_EVENT_LABELS,
  normalizeInvoiceOverdueOffsets,
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
  'invoice_sent',
  'payment_received',
  'lead_follow_up_due',
  'online_booking_received',
  'visit_reminder',
  'invoice_overdue_reminder',
]

const INVOICE_OVERDUE_OFFSET_OPTIONS = [7, 14, 30] as const

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
          <strong className="text-foreground">Automated reminders:</strong> schedule a daily call to{' '}
          <code>/api/cron/notifications</code> with your <code>CRON_SECRET</code> for lead follow-ups,
          visit reminders, and invoice overdue notices.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <Label className="text-sm font-medium">Reminder timing</Label>
          <p className="text-xs text-muted-foreground mt-1">
            The daily cron uses your company timezone for visit reminders.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="visit-hours-before">Visit reminder lead time (hours)</Label>
          <Input
            id="visit-hours-before"
            type="number"
            min={1}
            max={168}
            value={preferences.reminders.visit_hours_before}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              updatePreference((current) => ({
                ...current,
                reminders: {
                  ...current.reminders,
                  visit_hours_before:
                    Number.isFinite(parsed) && parsed >= 1
                      ? Math.min(168, Math.round(parsed))
                      : current.reminders.visit_hours_before,
                },
              }))
            }}
          />
          <p className="text-xs text-muted-foreground">
            Clients are reminded on the day that is this many hours before the visit (24 = day before).
          </p>
        </div>

        <div className="space-y-2">
          <Label>Invoice overdue reminders (days past due)</Label>
          <div className="flex flex-wrap gap-3">
            {INVOICE_OVERDUE_OFFSET_OPTIONS.map((offset) => {
              const selected = preferences.reminders.invoice_overdue_day_offsets.includes(offset)
              return (
                <label key={offset} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(checked) => {
                      updatePreference((current) => {
                        const next = checked
                          ? [...current.reminders.invoice_overdue_day_offsets, offset]
                          : current.reminders.invoice_overdue_day_offsets.filter(
                              (value) => value !== offset
                            )
                        return {
                          ...current,
                          reminders: {
                            ...current.reminders,
                            invoice_overdue_day_offsets: normalizeInvoiceOverdueOffsets(next),
                          },
                        }
                      })
                    }}
                  />
                  {offset} days
                </label>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Clients with a sent invoice and outstanding balance are notified once per selected milestone.
          </p>
        </div>
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
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="px-3">Event</TableHead>
                <TableHead className="px-3 text-center w-20">Email</TableHead>
                <TableHead className="px-3 text-center w-20">SMS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {EVENT_ORDER.map((event) => {
                const eventPrefs = preferences.events[event] || {}
                return (
                  <TableRow key={event}>
                    <TableCell className="px-3">{NOTIFICATION_EVENT_LABELS[event]}</TableCell>
                    <TableCell className="px-3 text-center">
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
                    </TableCell>
                    <TableCell className="px-3 text-center">
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
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
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