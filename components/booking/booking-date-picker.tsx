'use client'

import { useMemo, useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { BookingSettings } from '@/lib/booking'
import { isBookingDateSelectable } from '@/lib/booking-slots'
import { formatDateLabel, parseDateValue } from '@/lib/datetime-input'
import { getCompanyDateString } from '@/lib/timezone'
import { cn } from '@/lib/utils'

type BookingDatePickerProps = {
  value: string
  onChange: (value: string) => void
  timezone: string
  bookingSettings: Pick<BookingSettings, 'lookahead_days' | 'bookable_weekdays'>
  disabled?: boolean
  id?: string
}

export function BookingDatePicker({
  value,
  onChange,
  timezone,
  bookingSettings,
  disabled = false,
  id,
}: BookingDatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = parseDateValue(value)

  const today = useMemo(() => new Date(), [])
  const isDateDisabled = useMemo(
    () => (date: Date) => {
      const dateStr = getCompanyDateString(timezone, date)
      return !isBookingDateSelectable(dateStr, timezone, bookingSettings, today)
    },
    [timezone, bookingSettings, today]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground'
            )}
          />
        }
      >
        <CalendarIcon className="size-4 shrink-0 opacity-70" />
        {value ? formatDateLabel(value) : 'Pick a date'}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          disabled={isDateDisabled}
          onSelect={(date) => {
            if (!date) return
            const dateStr = getCompanyDateString(timezone, date)
            if (!isBookingDateSelectable(dateStr, timezone, bookingSettings, today)) {
              return
            }
            onChange(dateStr)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}