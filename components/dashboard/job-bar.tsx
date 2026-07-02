'use client'

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Badge } from '@/components/ui/badge'

interface JobBarProps {
  startTime: string
  durationMinutes: number
  title: string
  crew: string
  location: string
  status: 'Completed' | 'In Progress' | 'Scheduled'
  top?: string
}

export function JobBar({
  startTime,
  durationMinutes,
  title,
  crew,
  location,
  status,
  top = 'top-0',
}: JobBarProps) {
  const startHour = parseInt(startTime.split(':')[0])
  const startMinute = parseInt(startTime.split(':')[1] || '0')
  const startTotalMinutes = startHour * 60 + startMinute

  const timelineStart = 8 * 60
  const timelineEnd = 17 * 60
  const totalMinutes = timelineEnd - timelineStart

  const leftPercent = ((startTotalMinutes - timelineStart) / totalMinutes) * 100
  const widthPercent = (durationMinutes / totalMinutes) * 100

  const getStatusVariant = (status: string) => {
    if (status === 'Completed') return 'outline'
    if (status === 'In Progress') return 'default'
    return 'secondary'
  }

  return (
    <div
      className={`absolute ${top}`}
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`
      }}
    >
      <HoverCard>
        <HoverCardTrigger>
          <div className="h-9 w-full rounded-md border bg-background flex items-center px-3 shadow-sm text-xs cursor-pointer hover:bg-accent transition-colors">
            <div className="flex items-center gap-2 w-full min-w-0">
              <span className="font-medium truncate">{title}</span>
            </div>
          </div>
        </HoverCardTrigger>

        <HoverCardContent
          className="w-64 z-[100]"
          side="bottom"
          align="start"
          sideOffset={10}
          alignOffset={-5}
        >
          <div className="space-y-2">
            <div>
              <div className="font-semibold">{title}</div>
              <div className="text-xs text-muted-foreground">
                {startTime} – {calculateEndTime(startTime, durationMinutes)}
              </div>
            </div>
            <div className="text-sm">
              <span className="font-medium">Crew:</span> {crew}
            </div>
            <div className="text-sm">
              <span className="font-medium">Location:</span> {location}
            </div>
            <Badge variant={getStatusVariant(status)}>{status}</Badge>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  )
}

function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hourStr, minuteStr] = startTime.split(':')
  const start = new Date()
  start.setHours(parseInt(hourStr), parseInt(minuteStr || '0'))
  const end = new Date(start.getTime() + durationMinutes * 60000)
  return end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
}

function getStatusVariant(status: string) {
  if (status === 'Completed') return 'outline'
  if (status === 'In Progress') return 'default'
  return 'secondary'
}
