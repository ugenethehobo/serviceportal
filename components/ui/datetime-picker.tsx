'use client'

import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TimePicker } from '@/components/ui/time-picker'
import {
  formatDateValue,
  formatDatetimeLabel,
  joinDatetimeLocal,
  parseDateValue,
  splitDatetimeLocal,
} from '@/lib/datetime-input'
import { cn } from '@/lib/utils'

type DateTimePickerProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  id?: string
  minuteStep?: number
}

export function DateTimePicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Pick date and time',
  className,
  id,
  minuteStep = 15,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const { date, time } = splitDatetimeLocal(value)
  const selected = parseDateValue(date)

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
              !value && 'text-muted-foreground',
              className
            )}
          />
        }
      >
        <CalendarIcon className="size-4 shrink-0 opacity-70" />
        {value ? formatDatetimeLabel(value) : placeholder}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col gap-3 p-3">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(nextDate) => {
              if (!nextDate) return
              onChange(joinDatetimeLocal(formatDateValue(nextDate), time || '09:00'))
            }}
          />
          <div className="border-t pt-3">
            <Label className="mb-2 block text-xs text-muted-foreground">Time</Label>
            <TimePicker
              value={time || '09:00'}
              minuteStep={minuteStep}
              disabled={disabled || !date}
              onChange={(nextTime) => {
                if (!date) return
                onChange(joinDatetimeLocal(date, nextTime))
              }}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={!date || !time}
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}