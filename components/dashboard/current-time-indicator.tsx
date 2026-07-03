'use client'

import { useEffect, useState } from 'react'
import {
  minutesToTimelinePercent,
  type BusinessHours,
} from '@/lib/business-hours'
import { getMinutesFromMidnightInTimezone } from '@/lib/timezone'

interface CurrentTimeIndicatorProps {
  businessHours: BusinessHours
  timezone: string
}

export function CurrentTimeIndicator({ businessHours, timezone }: CurrentTimeIndicatorProps) {
  const [position, setPosition] = useState<number | null>(null)

  useEffect(() => {
    const updatePosition = () => {
      const nowIso = new Date().toISOString()
      const minutes = getMinutesFromMidnightInTimezone(nowIso, timezone)
      const percent = minutesToTimelinePercent(minutes, businessHours)
      const inRange = percent >= 0 && percent <= 100
      setPosition(inRange ? percent : null)
    }

    updatePosition()
    const interval = setInterval(updatePosition, 60_000)
    return () => clearInterval(interval)
  }, [businessHours, timezone])

  if (position === null) return null

  return (
    <div
      className="absolute top-6 bottom-0 w-px bg-red-500 z-20 transition-all duration-500"
      style={{ left: `${position}%` }}
    >
      <div className="absolute -top-1 -left-[5px] w-3 h-3 bg-red-500 rounded-full ring-4 ring-red-500/20" />
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium text-red-600 whitespace-nowrap">
        Now
      </div>
    </div>
  )
}