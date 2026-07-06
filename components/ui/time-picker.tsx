'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { joinTimeValue, splitTimeValue } from '@/lib/datetime-input'
import { cn } from '@/lib/utils'

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))

function buildMinuteOptions(step: number) {
  const options: string[] = []
  for (let minute = 0; minute < 60; minute += step) {
    options.push(String(minute).padStart(2, '0'))
  }
  return options
}

type TimePickerProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  minuteStep?: number
  className?: string
  id?: string
}

export function TimePicker({
  value,
  onChange,
  disabled = false,
  minuteStep = 15,
  className,
  id,
}: TimePickerProps) {
  const { hour, minute } = splitTimeValue(value)
  const minuteOptions = buildMinuteOptions(minuteStep)

  const resolvedMinute =
    minute && minuteOptions.includes(minute)
      ? minute
      : minuteOptions[0] || '00'

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)} id={id}>
      <div>
        <Label className="sr-only">Hour</Label>
        <Select
          value={hour || undefined}
          onValueChange={(nextHour) => onChange(joinTimeValue(nextHour ?? '', resolvedMinute))}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Hour" />
          </SelectTrigger>
          <SelectContent>
            {HOURS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="sr-only">Minute</Label>
        <Select
          value={hour ? resolvedMinute : undefined}
          onValueChange={(nextMinute) => onChange(joinTimeValue(hour, nextMinute ?? '00'))}
          disabled={disabled || !hour}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Min" />
          </SelectTrigger>
          <SelectContent>
            {minuteOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}