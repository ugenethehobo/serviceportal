'use client'

import Link from 'next/link'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Badge } from '@/components/ui/badge'
import {
  minutesToTimelinePercent,
  parseTimeToMinutes,
  type BusinessHours,
} from '@/lib/business-hours'

interface JobBarProps {
  startMinutes: number
  durationMinutes: number
  title: string
  crew: string
  location: string
  status: 'Completed' | 'In Progress' | 'Scheduled'
  businessHours: BusinessHours
  clientId: string
  jobId: string
  lane?: number
  laneHeight?: number
  laneGap?: number
}

export function JobBar({
  startMinutes,
  durationMinutes,
  title,
  crew,
  location,
  status,
  businessHours,
  clientId,
  jobId,
  lane = 0,
  laneHeight = 36,
  laneGap = 4,
}: JobBarProps) {
  const timelineStart = parseTimeToMinutes(businessHours.start)
  const timelineEnd = parseTimeToMinutes(businessHours.end)
  const clippedStart = Math.max(startMinutes, timelineStart)
  const clippedEnd = Math.min(startMinutes + durationMinutes, timelineEnd)
  const clippedDuration = Math.max(0, clippedEnd - clippedStart)

  if (clippedDuration <= 0) return null

  const leftPercent = minutesToTimelinePercent(clippedStart, businessHours)
  const widthPercent =
    minutesToTimelinePercent(clippedStart + clippedDuration, businessHours) - leftPercent
  const topOffset = lane * (laneHeight + laneGap)

  const startTime = formatMinutesLabel(startMinutes)
  const endTime = formatMinutesLabel(startMinutes + durationMinutes)

  const getStatusVariant = (value: string) => {
    if (value === 'Completed') return 'outline'
    if (value === 'In Progress') return 'default'
    return 'secondary'
  }

  return (
    <div
      className="absolute z-[1] overflow-visible hover:z-30"
      style={{
        left: `${leftPercent}%`,
        width: `${Math.max(widthPercent, 1.5)}%`,
        top: topOffset,
        height: laneHeight,
      }}
    >
      <HoverCard>
        <HoverCardTrigger
          render={
            <Link
              href={`/dashboard/clients/${clientId}/jobs/${jobId}`}
              className="relative block h-full w-full overflow-visible rounded-md border bg-background shadow-sm cursor-pointer hover:bg-accent transition-colors"
              aria-label={title}
            />
          }
        >
          <span className="pointer-events-none absolute left-1.5 top-1/2 z-10 max-w-none -translate-y-1/2 whitespace-nowrap rounded-sm bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground shadow-sm ring-1 ring-primary/40">
            {title}
          </span>
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
                {startTime} – {endTime}
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

function formatMinutesLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}