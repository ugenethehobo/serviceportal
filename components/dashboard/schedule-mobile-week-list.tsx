'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  getCrewColorClasses,
  type ScheduleCalendarData,
  type ScheduleCalendarJob,
} from '@/lib/schedule-calendar'
import { Loader2, MapPin, Repeat } from 'lucide-react'

function formatJobTimeRange(job: ScheduleCalendarJob) {
  const start = new Date(job.startTime)
  const end = new Date(job.endTime)
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  }
  return `${start.toLocaleTimeString([], timeOpts)} – ${end.toLocaleTimeString([], timeOpts)}`
}

type ScheduleMobileWeekListProps = {
  data: ScheduleCalendarData
  pendingHref: string | null
  isInteractionLocked: boolean
  onJobClick: (job: ScheduleCalendarJob) => void
  className?: string
}

export function ScheduleMobileWeekList({
  data,
  pendingHref,
  isInteractionLocked,
  onJobClick,
  className,
}: ScheduleMobileWeekListProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3">
        <div className="space-y-5">
          {data.days.map((day) => {
            const dayJobs = data.jobs
              .filter((job) => job.dayIndex === day.dayIndex)
              .sort((a, b) => a.startMinutes - b.startMinutes)

            return (
              <section key={day.dateStr}>
                <div
                  className={cn(
                    'sticky top-0 z-10 -mx-3 mb-2 border-b bg-card/95 px-3 py-2 backdrop-blur-sm',
                    day.isToday && 'border-primary/30'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{day.shortLabel}</p>
                      <p className="text-xs text-muted-foreground">{day.label}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {day.isClosed && (
                        <Badge variant="outline" className="text-[10px]">
                          Closed
                        </Badge>
                      )}
                      {day.isToday && (
                        <Badge variant="secondary" className="text-[10px]">
                          Today
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {day.isClosed ? (
                  <p className="px-1 py-3 text-sm text-muted-foreground">
                    Closed — no new jobs can be scheduled
                  </p>
                ) : dayJobs.length === 0 ? (
                  <p className="px-1 py-3 text-sm text-muted-foreground">No jobs scheduled</p>
                ) : (
                  <ul className="space-y-2">
                    {dayJobs.map((job) => {
                      const colors = getCrewColorClasses(job.colorIndex)
                      const href = `/dashboard/clients/${job.clientId}/jobs/${
                        job.isProjected && job.anchorJobId ? job.anchorJobId : job.id
                      }`
                      const isOpening = pendingHref === href

                      return (
                        <li key={job.id}>
                          <button
                            type="button"
                            disabled={isInteractionLocked}
                            onClick={() => onJobClick(job)}
                            className={cn(
                              'w-full rounded-lg border bg-card p-3 text-left shadow-sm transition-colors',
                              'hover:bg-muted/40 active:bg-muted/60',
                              'disabled:pointer-events-none disabled:opacity-60',
                              job.isProjected && 'border-dashed'
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={cn(
                                  'mt-1 size-3 shrink-0 rounded-full border',
                                  colors.bg,
                                  colors.border
                                )}
                                aria-hidden
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-medium leading-snug">{job.title}</p>
                                  {isOpening && (
                                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                                  )}
                                </div>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                  {formatJobTimeRange(job)}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">{job.clientName}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{job.crewName}</span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {job.displayStatus}
                                  </Badge>
                                  {job.recurringRuleId && (
                                    <span className="inline-flex items-center gap-1">
                                      <Repeat className="size-3" />
                                      Recurring
                                    </span>
                                  )}
                                  {job.isProjected && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      Projected
                                    </Badge>
                                  )}
                                </div>
                                {job.location ? (
                                  <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                                    <MapPin className="mt-0.5 size-3 shrink-0" />
                                    <span className="line-clamp-2">{job.location}</span>
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </div>

      <div className="shrink-0 border-t px-3 py-2">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {data.crews.map((crew) => {
            const colors = getCrewColorClasses(crew.colorIndex)
            return (
              <span
                key={crew.id}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground"
              >
                <span className={cn('size-2 rounded-full border', colors.bg, colors.border)} />
                {crew.name}
              </span>
            )
          })}
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
            <span
              className={cn(
                'size-2 rounded-full border',
                getCrewColorClasses(-1).bg,
                getCrewColorClasses(-1).border
              )}
            />
            Unassigned
          </span>
        </div>
      </div>
    </div>
  )
}