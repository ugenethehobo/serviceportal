'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getBookingSettingsAction,
  updateBookingSettingsAction,
} from '@/app/booking-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_BOOKABLE_WEEKDAYS,
  DEFAULT_BOOKING_SETTINGS,
  type BookingMode,
  type BookingSettings,
} from '@/lib/booking'
import { cn } from '@/lib/utils'
import { CalendarClock, ClipboardList, Copy, Link2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const

interface ClientBookingSettingsProps {
  embedded?: boolean
}

export function ClientBookingSettings({ embedded = false }: ClientBookingSettingsProps = {}) {
  const [bookingMode, setBookingMode] = useState<BookingMode>('request_form')
  const [bookingSlug, setBookingSlug] = useState('')
  const [bookingUrl, setBookingUrl] = useState('')
  const [activePackageCount, setActivePackageCount] = useState(0)
  const [bookingSettings, setBookingSettings] =
    useState<BookingSettings>(DEFAULT_BOOKING_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    const result = await getBookingSettingsAction()
    if (!result.success) {
      toast.error(result.error || 'Failed to load booking settings')
      setIsLoading(false)
      return
    }

    setBookingMode(result.bookingMode)
    setBookingSlug(result.bookingSlug)
    setBookingUrl(result.bookingUrl)
    setBookingSettings(result.bookingSettings)
    setActivePackageCount(result.activePackageCount)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl)
      toast.success('Booking link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    const result = await updateBookingSettingsAction({
      bookingMode,
      bookingSlug,
      bookingSettings,
    })
    setIsSaving(false)

    if (!result.success) {
      toast.error(result.error || 'Failed to save booking settings')
      return
    }

    setBookingUrl(result.bookingUrl)
    toast.success('Client booking settings saved')
    await loadSettings()
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading client booking settings…</p>
  }

  const content = (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-muted p-2 shrink-0">
          <Link2 className="size-4 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold tracking-tight">Client booking</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Share a public link so clients can either book themselves online or submit a service
            request. Service packages are managed separately and power both modes.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">{activePackageCount}</strong> active service{' '}
          {activePackageCount === 1 ? 'package' : 'packages'} configured.{' '}
          <Link href="/dashboard/settings?section=service-packages" className="text-primary hover:underline">
            Manage packages
          </Link>
        </p>
      </div>

      <div className="space-y-3">
        <Label>Booking mode</Label>
        <RadioGroup
          value={bookingMode}
          onValueChange={(value) =>
            setBookingMode((value ?? 'request_form') as BookingMode)
          }
          className="grid gap-3 sm:grid-cols-2"
        >
          <BookingModeOption
            value="request_form"
            title="Request form"
            description="Clients pick services and submit a lead. You follow up to schedule."
            icon={ClipboardList}
            selected={bookingMode === 'request_form'}
          />
          <BookingModeOption
            value="online_booking"
            title="Online booking"
            description="Clients pick a package and time. Crew is auto-assigned."
            icon={CalendarClock}
            selected={bookingMode === 'online_booking'}
          />
        </RadioGroup>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div className="space-y-2">
          <Label htmlFor="booking-slug">Public booking link</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">/book/</span>
              <Input
                id="booking-slug"
                value={bookingSlug}
                onChange={(event) => setBookingSlug(event.target.value.toLowerCase())}
                placeholder="your-company"
              />
            </div>
            <Button type="button" variant="outline" onClick={handleCopyUrl}>
              <Copy className="size-4 mr-2" />
              Copy link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground break-all">{bookingUrl}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="welcome-message">Welcome message (optional)</Label>
          <Textarea
            id="welcome-message"
            value={bookingSettings.welcome_message || ''}
            onChange={(event) =>
              setBookingSettings((current) => ({
                ...current,
                welcome_message: event.target.value.trim() || null,
              }))
            }
            rows={2}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="request-heading">Request form heading</Label>
            <Input
              id="request-heading"
              value={bookingSettings.request_form_heading || ''}
              onChange={(event) =>
                setBookingSettings((current) => ({
                  ...current,
                  request_form_heading: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="online-heading">Online booking heading</Label>
            <Input
              id="online-heading"
              value={bookingSettings.online_booking_heading || ''}
              onChange={(event) =>
                setBookingSettings((current) => ({
                  ...current,
                  online_booking_heading: event.target.value,
                }))
              }
            />
          </div>
        </div>
      </div>

      {bookingMode === 'online_booking' ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <Label>Slot availability</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Uses your company business hours from Settings → Company. Travel buffer also applies
              when staff schedule or reschedule jobs.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="travel-buffer">Travel buffer (minutes)</Label>
              <Input
                id="travel-buffer"
                type="number"
                min={0}
                max={120}
                step={5}
                value={bookingSettings.travel_buffer_minutes}
                onChange={(event) =>
                  setBookingSettings((current) => ({
                    ...current,
                    travel_buffer_minutes: Number(event.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-notice">Minimum notice (hours)</Label>
              <Input
                id="min-notice"
                type="number"
                min={0}
                max={168}
                value={bookingSettings.min_notice_hours}
                onChange={(event) =>
                  setBookingSettings((current) => ({
                    ...current,
                    min_notice_hours: Number(event.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slot-interval">Slot interval (minutes)</Label>
              <Input
                id="slot-interval"
                type="number"
                min={15}
                max={120}
                step={15}
                value={bookingSettings.slot_interval_minutes}
                onChange={(event) =>
                  setBookingSettings((current) => ({
                    ...current,
                    slot_interval_minutes: Number(event.target.value) || 30,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lookahead-days">Booking window (days ahead)</Label>
              <Input
                id="lookahead-days"
                type="number"
                min={1}
                max={90}
                value={bookingSettings.lookahead_days}
                onChange={(event) =>
                  setBookingSettings((current) => ({
                    ...current,
                    lookahead_days: Number(event.target.value) || 28,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Bookable days</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const selected = bookingSettings.bookable_weekdays.includes(day.value)
                return (
                  <label
                    key={day.value}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm cursor-pointer',
                      selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    )}
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) => {
                        setBookingSettings((current) => {
                          const next = checked
                            ? [...current.bookable_weekdays, day.value]
                            : current.bookable_weekdays.filter((value) => value !== day.value)
                          return {
                            ...current,
                            bookable_weekdays:
                              next.length > 0 ? next.sort((a, b) => a - b) : [...DEFAULT_BOOKABLE_WEEKDAYS],
                          }
                        })
                      }}
                    />
                    {day.label}
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
          Request form mode lets clients choose service packages and creates a new lead for your
          team to follow up. Add packages in Settings → Service packages so clients have options to
          pick from.
        </div>
      )}

      <Button type="button" onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save client booking settings'}
      </Button>
    </div>
  )

  if (embedded) return content
  return <section className="rounded-lg border bg-card/50 p-4">{content}</section>
}

function BookingModeOption({
  value,
  selected,
  title,
  description,
  icon: Icon,
}: {
  value: BookingMode
  selected: boolean
  title: string
  description: string
  icon: typeof ClipboardList
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50',
        selected && 'border-primary bg-primary/5'
      )}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <Icon
        className={cn(
          'size-5 shrink-0',
          selected ? 'text-primary' : 'text-muted-foreground'
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
    </label>
  )
}