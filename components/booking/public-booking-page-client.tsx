'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  confirmPublicOnlineBookingAction,
  createPublicBookingRequestAction,
  getPublicBookingSlotsAction,
  type PublicBookingPageData,
} from '@/app/booking-actions'
import { StructuredAddressForm } from '@/components/dashboard/company-address-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BookingDatePicker } from '@/components/booking/booking-date-picker'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  emptyStructuredAddress,
  isStructuredAddressEmpty,
  validateStructuredAddressIfPresent,
  type StructuredAddress,
  type StructuredAddressErrors,
} from '@/lib/address'
import {
  formatBookingDuration,
  formatBookingPrice,
  type BookingSlot,
} from '@/lib/booking-slots'
import type { BookableService } from '@/lib/booking'
import { cn } from '@/lib/utils'
import { CalendarDays, CheckCircle2, ClipboardList, Loader2, Users } from 'lucide-react'

type BookingDateOption = {
  dateStr: string
  label: string
}

interface PublicBookingPageClientProps {
  slug: string
  data: PublicBookingPageData
  dateOptions: BookingDateOption[]
}

type SuccessState =
  | { mode: 'request_form' }
  | { mode: 'online_booking'; serviceName: string; startTime: string }

export function PublicBookingPageClient({
  slug,
  data,
  dateOptions,
}: PublicBookingPageClientProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [preferredTime, setPreferredTime] = useState('')
  const [address, setAddress] = useState<StructuredAddress>(emptyStructuredAddress())
  const [addressErrors, setAddressErrors] = useState<StructuredAddressErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<SuccessState | null>(null)

  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    data.services[0]?.id || ''
  )
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null)

  const selectedService = useMemo(
    () => data.services.find((service) => service.id === selectedServiceId) || null,
    [data.services, selectedServiceId]
  )

  useEffect(() => {
    if (!dateOptions.length) {
      setSelectedDate('')
      return
    }
    setSelectedDate((current) =>
      current && dateOptions.some((option) => option.dateStr === current)
        ? current
        : dateOptions[0].dateStr
    )
  }, [dateOptions])

  useEffect(() => {
    if (
      data.bookingMode !== 'online_booking' ||
      !data.hasBookableCrews ||
      !selectedServiceId ||
      !selectedDate
    ) {
      return
    }
    void loadSlots(selectedServiceId, selectedDate)
  }, [data.bookingMode, data.hasBookableCrews, selectedServiceId, selectedDate])

  const heading =
    data.bookingMode === 'online_booking'
      ? data.bookingSettings.online_booking_heading
      : data.bookingSettings.request_form_heading

  const validateAddress = () => {
    const validation = validateStructuredAddressIfPresent(address)
    setAddressErrors(validation.errors)
    return validation.valid
  }

  const addressPayload = isStructuredAddressEmpty(address) ? undefined : address

  const handleRequestSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!email.trim() && !phone.trim()) {
      setError('Email or phone is required')
      return
    }
    if (!validateAddress()) return

    setIsSubmitting(true)
    const result = await createPublicBookingRequestAction({
      slug,
      name,
      email,
      phone,
      notes,
      preferredTime,
      leadAddress: addressPayload,
    })
    setIsSubmitting(false)

    if (!result.success) {
      setError(result.error || 'Could not submit request')
      return
    }

    setSuccess({ mode: 'request_form' })
  }

  const loadSlots = async (serviceId: string, dateStr: string) => {
    if (!serviceId || !dateStr) {
      setSlots([])
      setSelectedSlotIso(null)
      return
    }

    setSlotsLoading(true)
    setError('')
    const result = await getPublicBookingSlotsAction({ slug, serviceId, dateStr })
    setSlotsLoading(false)

    if (!result.success) {
      setError(result.error || 'Could not load available times')
      setSlots([])
      setSelectedSlotIso(null)
      return
    }

    setSlots(result.slots)
    setSelectedSlotIso(result.slots[0]?.startIso || null)
  }

  const handleServiceChange = async (serviceId: string) => {
    setSelectedServiceId(serviceId)
    await loadSlots(serviceId, selectedDate)
  }

  const handleDateChange = async (dateStr: string) => {
    setSelectedDate(dateStr)
    await loadSlots(selectedServiceId, dateStr)
  }

  const handleOnlineSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!selectedServiceId) {
      setError('Select a service')
      return
    }
    if (!selectedSlotIso) {
      setError('Select an available time')
      return
    }
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    if (!validateAddress()) return

    setIsSubmitting(true)
    const result = await confirmPublicOnlineBookingAction({
      slug,
      serviceId: selectedServiceId,
      startIso: selectedSlotIso,
      name,
      email,
      phone,
      notes,
      leadAddress: addressPayload,
    })
    setIsSubmitting(false)

    if (!result.success) {
      setError(result.error || 'Could not complete booking')
      await loadSlots(selectedServiceId, selectedDate)
      return
    }

    setSuccess({
      mode: 'online_booking',
      serviceName: result.serviceName,
      startTime: result.startTime,
    })
  }

  if (success) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto rounded-full bg-emerald-500/10 p-3 w-fit">
              <CheckCircle2 className="size-8 text-emerald-600" />
            </div>
            <CardTitle>
              {success.mode === 'online_booking' ? 'Visit booked' : 'Request received'}
            </CardTitle>
            <CardDescription>
              {success.mode === 'online_booking' ? (
                <>
                  Your <strong>{success.serviceName}</strong> visit is confirmed for{' '}
                  <strong>
                    {new Date(success.startTime).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </strong>
                  . We sent a confirmation to your email.
                </>
              ) : (
                <>
                  Thanks — {data.companyName} received your request and will follow up soon.
                </>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="text-center space-y-3">
          {data.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.logoUrl}
              alt={`${data.companyName} logo`}
              className="mx-auto h-14 w-auto object-contain"
            />
          ) : null}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{data.companyName}</h1>
            <p className="text-muted-foreground mt-1">{heading}</p>
          </div>
          {data.bookingSettings.welcome_message ? (
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              {data.bookingSettings.welcome_message}
            </p>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {data.bookingMode === 'online_booking' ? (
                <CalendarDays className="size-5 text-muted-foreground" />
              ) : (
                <ClipboardList className="size-5 text-muted-foreground" />
              )}
              {data.bookingMode === 'online_booking' ? 'Book a visit' : 'Request service'}
            </CardTitle>
            <CardDescription>
              {data.bookingMode === 'online_booking'
                ? 'Choose a service and available time. We assign the best crew automatically.'
                : 'Tell us what you need and we will reach out to schedule.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.bookingMode === 'request_form' ? (
              <form onSubmit={handleRequestSubmit} className="space-y-4">
                <ContactFields
                  name={name}
                  email={email}
                  phone={phone}
                  notes={notes}
                  onNameChange={setName}
                  onEmailChange={setEmail}
                  onPhoneChange={setPhone}
                  onNotesChange={setNotes}
                  emailRequired={false}
                />
                <div>
                  <Label htmlFor="preferred-time">Preferred time (optional)</Label>
                  <Input
                    id="preferred-time"
                    value={preferredTime}
                    onChange={(event) => setPreferredTime(event.target.value)}
                    placeholder="Weekday mornings, after 3pm, etc."
                    className="mt-1"
                  />
                </div>
                <StructuredAddressForm
                  value={address}
                  onChange={setAddress}
                  errors={addressErrors}
                  idPrefix="booking"
                  required={false}
                />
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    'Submit request'
                  )}
                </Button>
              </form>
            ) : data.services.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Online booking is not available yet. Please contact {data.companyName} directly.
              </p>
            ) : !data.hasBookableCrews ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950 space-y-2">
                <div className="flex items-start gap-2">
                  <Users className="size-4 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">Online scheduling is temporarily unavailable</p>
                    <p className="text-amber-900/90">
                      {data.companyName} has not finished setting up crews for booking yet. Please
                      contact them directly to schedule your visit.
                    </p>
                  </div>
                </div>
              </div>
            ) : dateOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bookable days are configured right now. Please contact {data.companyName} directly.
              </p>
            ) : (
              <form onSubmit={handleOnlineSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label>Service</Label>
                  <RadioGroup
                    value={selectedServiceId}
                    onValueChange={(value) => {
                      if (value) void handleServiceChange(value)
                    }}
                    className="grid gap-2"
                  >
                    {data.services.map((service) => (
                      <ServiceRadioOption
                        key={service.id}
                        service={service}
                        selected={selectedServiceId === service.id}
                      />
                    ))}
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="booking-date">Date</Label>
                  <BookingDatePicker
                    id="booking-date"
                    value={selectedDate}
                    onChange={(value) => void handleDateChange(value)}
                    timezone={data.timezone}
                    bookingSettings={data.bookingSettings}
                  />
                  <p className="text-xs text-muted-foreground">
                    Only bookable days from {data.companyName}&apos;s schedule are shown.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Available times</Label>
                  {slotsLoading ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Loading times…
                    </p>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No open times on this day. Try another date
                      {selectedService ? ` for ${selectedService.name}` : ''}.
                    </p>
                  ) : (
                    <ToggleGroup
                      value={selectedSlotIso ? [selectedSlotIso] : []}
                      onValueChange={(values) => setSelectedSlotIso(values[0] ?? null)}
                      variant="outline"
                      spacing={2}
                      className="flex flex-wrap gap-2"
                    >
                      {slots.map((slot) => (
                        <ToggleGroupItem
                          key={slot.startIso}
                          value={slot.startIso}
                          className="px-3 py-2 text-sm data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground"
                        >
                          {slot.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  )}
                </div>

                <ContactFields
                  name={name}
                  email={email}
                  phone={phone}
                  notes={notes}
                  onNameChange={setName}
                  onEmailChange={setEmail}
                  onPhoneChange={setPhone}
                  onNotesChange={setNotes}
                  emailRequired
                />
                <StructuredAddressForm
                  value={address}
                  onChange={setAddress}
                  errors={addressErrors}
                  idPrefix="booking-online"
                  required={false}
                />
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting || slotsLoading || !selectedSlotIso}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Booking…
                    </>
                  ) : (
                    'Confirm booking'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ServiceRadioOption({
  service,
  selected,
}: {
  service: BookableService
  selected: boolean
}) {
  const priceLabel = formatBookingPrice(service.price_estimate)
  return (
    <label
      className={cn(
        'flex w-full cursor-pointer items-start justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50',
        selected && 'border-primary bg-primary/5'
      )}
    >
      <RadioGroupItem value={service.id} className="sr-only" />
      <div className="min-w-0">
        <p className="font-medium">{service.name}</p>
        {service.description ? (
          <p className="text-sm text-muted-foreground mt-0.5">{service.description}</p>
        ) : null}
      </div>
      <div className="text-right text-sm text-muted-foreground shrink-0">
        <p>{formatBookingDuration(service.duration_minutes)}</p>
        {priceLabel ? <p>{priceLabel}</p> : null}
      </div>
    </label>
  )
}

function ContactFields({
  name,
  email,
  phone,
  notes,
  onNameChange,
  onEmailChange,
  onPhoneChange,
  onNotesChange,
  emailRequired,
}: {
  name: string
  email: string
  phone: string
  notes: string
  onNameChange: (value: string) => void
  onEmailChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onNotesChange: (value: string) => void
  emailRequired: boolean
}) {
  return (
    <div className="space-y-4 border-t pt-5">
      <p className="text-sm font-medium">Your contact info</p>
      <div>
        <Label htmlFor="booking-name">Name *</Label>
        <Input
          id="booking-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          className="mt-1"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="booking-email">
            Email{emailRequired ? ' *' : ' (email or phone required)'}
          </Label>
          <Input
            id="booking-email"
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="mt-1"
            required={emailRequired}
          />
        </div>
        <div>
          <Label htmlFor="booking-phone">Phone</Label>
          <Input
            id="booking-phone"
            type="tel"
            value={phone}
            onChange={(event) => onPhoneChange(event.target.value)}
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="booking-notes">Notes (optional)</Label>
        <Textarea
          id="booking-notes"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          className="mt-1"
          rows={3}
        />
      </div>
    </div>
  )
}