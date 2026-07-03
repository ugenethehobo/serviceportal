'use client'

import type { BusinessHours } from '@/lib/business-hours'
import { getTimelineHourLabels } from '@/lib/business-hours'
import type { DashboardTimelineJob, TimelineDayMode } from '@/lib/dashboard-overview'
import { CurrentTimeIndicator } from '@/components/dashboard/current-time-indicator'
import { JobBar } from '@/components/dashboard/job-bar'

interface JobsTimelineProps {
  jobs: DashboardTimelineJob[]
  businessHours: BusinessHours
  timezone: string
  laneCount: number
  timelineMode: TimelineDayMode
}

const LANE_HEIGHT = 40
const LANE_GAP = 4

export function JobsTimeline({
  jobs,
  businessHours,
  timezone,
  laneCount,
  timelineMode,
}: JobsTimelineProps) {
  const hourLabels = getTimelineHourLabels(businessHours)
  const trackHeight = Math.max(1, laneCount) * LANE_HEIGHT + Math.max(0, laneCount - 1) * LANE_GAP
  const showCurrentTime = timelineMode === 'today'

  if (jobs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg">
        <p className="text-sm text-muted-foreground">
          {timelineMode === 'tomorrow'
            ? 'No jobs scheduled for tomorrow.'
            : 'No jobs scheduled for today.'}
        </p>
      </div>
    )
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div className="relative pt-8 pb-4 h-full min-h-[120px]">
        <div className="absolute top-6 left-0 right-0 h-px bg-border" />

        <div className="absolute top-6 bottom-0 left-0 right-0 flex justify-between px-1 pointer-events-none">
          {hourLabels.map((_, index) => (
            <div key={index} className="w-px h-full bg-muted-foreground/20" />
          ))}
        </div>

        <div className="absolute top-6 left-0 right-0 flex justify-between text-[10px] text-muted-foreground px-1 -mt-5">
          {hourLabels.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>

        {showCurrentTime && (
          <CurrentTimeIndicator businessHours={businessHours} timezone={timezone} />
        )}

        <div className="relative mt-8" style={{ height: trackHeight }}>
          {jobs.map((job) => (
            <JobBar
              key={job.id}
              startMinutes={job.startMinutes}
              durationMinutes={job.durationMinutes}
              title={job.title}
              crew={job.crewName}
              location={job.location}
              status={job.displayStatus}
              businessHours={businessHours}
              clientId={job.clientId}
              jobId={job.id}
              lane={job.lane}
              laneHeight={LANE_HEIGHT}
              laneGap={LANE_GAP}
            />
          ))}
        </div>
      </div>
    </div>
  )
}