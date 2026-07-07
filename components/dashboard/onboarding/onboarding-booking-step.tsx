'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import {
  getBookingSettingsAction,
  updateBookingSettingsAction,
} from '@/app/booking-actions'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import type { OnboardingStepHandle } from '@/components/dashboard/onboarding/onboarding-profile-step'
import {
  DEFAULT_BOOKABLE_WEEKDAYS,
  DEFAULT_BOOKING_SETTINGS,
  isValidBookingSlug,
  type BookingMode,
  type BookingSettings,
} from '@/lib/booking'
import { cn } from '@/lib/utils'
import { CalendarClock, ClipboardList } from 'lucide-react'
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

type OnboardingBookingStepProps = {
  suggestedSlug: string
}

export const OnboardingBookingStep = forwardRef<
  OnboardingStepHandle,
  OnboardingBookingStepProps
>(function OnboardingBookingStep({ suggestedSlug }, ref) {
  const [bookingMode, setBookingMode] = useState<BookingMode>('request_form')
  const [bookingSlug, setBookingSlug] = useState(suggestedSlug)
  const [bookingSettings, setBookingSettings] =
    useState<BookingSettings>(DEFAULT_BOOKING_SETTINGS)
  const [activePackageCount, setActivePackageCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const result = await getBookingSettingsAction()
      if (result.success) {
        setBookingMode(result.bookingMode)
        setBookingSlug(result.bookingSlug || suggestedSlug)
        setBookingSettings(result.bookingSettings)
        setActivePackageCount(result.activePackageCount)
      }
      setIsLoading(false)
    }
    void load()
  }, [suggestedSlug])

  useImperativeHandle(ref, () => ({
    validateAndSave: async () => {
      const slug = bookingSlug.trim().toLowerCase()
      if (!isValidBookingSlug(slug)) {
        toast.error('Booking link must be 3–48 characters using lowercase letters, numbers, and hyphens')
        return false
      }

      if (bookingMode === 'online_booking' && activePackageCount === 0) {
        toast.error('Add at least one active service package for online booking')
        return false
      }

      const result = await updateBookingSettingsAction({
        bookingMode,
        bookingSlug: slug,
        bookingSettings,
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to save client booking settings')
        return false
      }

      return true
    },
  }))

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading booking settings…</p>
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Label>How should clients reach you?</Label>
        <RadioGroup
          value={bookingMode}
          onValueChange={(value) => setBookingMode((value ?? 'request_form') as BookingMode)}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50',
              bookingMode === 'request_form' && 'border-primary bg-primary/5'
            )}
          >
            <RadioGroupItem value="request_form" className="mt-0.5" />
            <ClipboardList className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Request form</p>
              <p className="text-sm text-muted-foreground mt-1">
                Clients pick services and submit a lead. You follow up to schedule.
              </p>
            </div>
          </label>
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50',
              bookingMode === 'online_booking' && 'border-primary bg-primary/5'
            )}
          >
            <RadioGroupItem value="online_booking" className="mt-0.5" />
            <CalendarClock className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Online booking</p>
              <p className="text-sm text-muted-foreground mt-1">
                Clients pick a package and available time. Crew is auto-assigned.
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-booking-slug">Public booking link</Label>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm text-muted-foreground shrink-0">/book/</span>
          <Input
            id="onboarding-booking-slug"
            value={bookingSlug}
            onChange={(event) => setBookingSlug(event.target.value.toLowerCase())}
            placeholder="your-company"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-welcome-message">Welcome message (optional)</Label>
        <Textarea
          id="onboarding-welcome-message"
          value={bookingSettings.welcome_message || ''}
          onChange={(event) =>
            setBookingSettings((current) => ({
              ...current,
              welcome_message: event.target.value.trim() || null,
            }))
          }
          rows={2}
          placeholder="Thanks for choosing us — we look forward to working with you."
        />
      </div>

      {bookingMode === 'online_booking' ? (
        <div className="space-y-3 rounded-lg border p-4">
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
      ) : null}
    </div>
  )
})