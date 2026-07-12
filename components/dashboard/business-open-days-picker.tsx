'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  DEFAULT_OPEN_WEEKDAYS,
  WEEKDAY_OPTIONS,
  normalizeOpenWeekdays,
} from '@/lib/business-hours'
import { cn } from '@/lib/utils'

interface BusinessOpenDaysPickerProps {
  value: number[]
  onChange: (openWeekdays: number[]) => void
  disabled?: boolean
  className?: string
}

export function BusinessOpenDaysPicker({
  value,
  onChange,
  disabled = false,
  className,
}: BusinessOpenDaysPickerProps) {
  const openWeekdays = normalizeOpenWeekdays(value)

  return (
    <div className={cn('space-y-2', className)}>
      <Label>Open days</Label>
      <p className="text-xs text-muted-foreground">
        Uncheck days your business is closed. Closed days apply to scheduling, the calendar, and
        online booking.
      </p>
      <div className="flex flex-wrap gap-2">
        {WEEKDAY_OPTIONS.map((day) => {
          const selected = openWeekdays.includes(day.value)
          return (
            <label
              key={day.value}
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
                disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50',
                selected ? 'border-primary bg-primary/5' : ''
              )}
            >
              <Checkbox
                checked={selected}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  if (disabled) return
                  const next = checked
                    ? [...openWeekdays, day.value]
                    : openWeekdays.filter((value) => value !== day.value)
                  onChange(
                    next.length > 0
                      ? next.sort((a, b) => a - b)
                      : [...DEFAULT_OPEN_WEEKDAYS]
                  )
                }}
              />
              {day.shortLabel}
            </label>
          )
        })}
      </div>
    </div>
  )
}