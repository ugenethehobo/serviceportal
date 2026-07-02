'use client'

import { useState, useEffect } from 'react'

export function CurrentTimeIndicator() {
  const [position, setPosition] = useState(0)

  useEffect(() => {
    const updatePosition = () => {
      const now = new Date()
      const hours = now.getHours() + now.getMinutes() / 60

      // Map time to percentage (assuming 7 AM to 5 PM window)
      const startHour = 7
      const endHour = 17
      const percentage = ((hours - startHour) / (endHour - startHour)) * 100

      setPosition(Math.max(0, Math.min(100, percentage)))
    }

    updatePosition()
    const interval = setInterval(updatePosition, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className="absolute top-6 bottom-0 w-px bg-red-500 z-20 transition-all duration-500"
      style={{ left: `calc(${position}% + 16px)` }}
    >
      <div className="absolute -top-1 -left-[5px] w-3 h-3 bg-red-500 rounded-full ring-4 ring-red-500/20" />
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium text-red-600 whitespace-nowrap">
        Now
      </div>
    </div>
  )
}
