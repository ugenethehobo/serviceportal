'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { rescheduleScheduleCalendarJobAction } from '@/app/action'
import { useNavigation } from '@/components/navigation/navigation-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { getTimelineDurationMinutes } from '@/lib/business-hours'
import {
  SCHEDULE_CALENDAR_PIXELS_PER_HOUR,
  buildIsoFromDayAndMinutes,
  calendarTopPxToMinutes,
  clampCalendarStartMinutes,
  getCrewColorClasses,
  getScheduleJobDragBlockedReason,
  minutesToCalendarTopPx,
  snapCalendarMinutes,
  type ScheduleCalendarData,
  type ScheduleCalendarJob,
} from '@/lib/schedule-calendar'
import { Loader2, Repeat } from 'lucide-react'
import { toast } from 'sonner'

const DRAG_THRESHOLD_PX = 6
const MIN_PIXELS_PER_HOUR = 40

type DragState = {
  job: ScheduleCalendarJob
  pointerId: number
  durationMinutes: number
  originDayIndex: number
  originStartMinutes: number
  currentDayIndex: number
  currentStartMinutes: number
  columnWidth: number
}

type PointerIntent = {
  job: ScheduleCalendarJob
  pointerId: number
  startX: number
  startY: number
}

type PendingReschedule = {
  job: ScheduleCalendarJob
  newStartIso: string
  newEndIso: string
}

interface ScheduleWeekGridProps {
  data: ScheduleCalendarData
  isLoadingWeek?: boolean
  onRescheduled: () => Promise<void>
}

function scheduleJobHref(job: ScheduleCalendarJob) {
  const jobId = job.isProjected && job.anchorJobId ? job.anchorJobId : job.id
  return `/dashboard/clients/${job.clientId}/jobs/${jobId}`
}

function ScheduleLoadingOverlay({
  message,
  subtle = false,
}: {
  message: string
  subtle?: boolean
}) {
  return (
    <div
      className={cn(
        'absolute inset-0 z-30 flex items-center justify-center',
        subtle ? 'bg-background/45' : 'bg-background/65 backdrop-blur-[2px]'
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-3 shadow-md">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  )
}

export function ScheduleWeekGrid({
  data,
  isLoadingWeek = false,
  onRescheduled,
}: ScheduleWeekGridProps) {
  const router = useRouter()
  const { startNavigation, pendingHref } = useNavigation()
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const pointerIntentRef = useRef<PointerIntent | null>(null)
  const [pixelsPerHour, setPixelsPerHour] = useState(SCHEDULE_CALENDAR_PIXELS_PER_HOUR)
  const [dragPreview, setDragPreview] = useState<{
    jobId: string
    dayIndex: number
    startMinutes: number
  } | null>(null)
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null)
  const isInteractionLocked = isLoadingWeek || isRescheduling

  const timelineHours = getTimelineDurationMinutes(data.businessHours) / 60

  useEffect(() => {
    const element = gridRef.current
    if (!element) return

    const updatePixelsPerHour = () => {
      const height = element.clientHeight
      if (height <= 0) return
      setPixelsPerHour(Math.max(MIN_PIXELS_PER_HOUR, height / timelineHours))
    }

    updatePixelsPerHour()
    const observer = new ResizeObserver(updatePixelsPerHour)
    observer.observe(element)
    return () => observer.disconnect()
  }, [timelineHours])

  const finishDrag = useCallback(() => {
    dragRef.current = null
    setDragPreview(null)
  }, [])

  const openJob = useCallback(
    (job: ScheduleCalendarJob) => {
      const href = scheduleJobHref(job)
      startNavigation(href)
      router.push(href)
    },
    [router, startNavigation]
  )

  const applyReschedule = useCallback(
    async (pending: PendingReschedule, scope: 'instance' | 'series') => {
      setPendingReschedule(null)
      setIsRescheduling(true)
      const toastId = toast.loading('Rescheduling job…')

      try {
        const result = await rescheduleScheduleCalendarJobAction({
          companyId: data.companyId,
          clientId: pending.job.clientId,
          scope,
          newStartTime: pending.newStartIso,
          newEndTime: pending.newEndIso,
          jobId: pending.job.id,
          isProjected: pending.job.isProjected,
          recurringRuleId: pending.job.recurringRuleId,
          anchorJobId: pending.job.anchorJobId,
          occurrenceStart: pending.job.occurrenceStart,
        })

        if (result.success) {
          toast.success(
            scope === 'series' ? 'Recurring series updated' : 'Visit rescheduled',
            { id: toastId }
          )
          setIsRescheduling(false)
          await onRescheduled()
        } else {
          const message =
            'error' in result && result.error
              ? result.error
              : 'Could not reschedule job'
          toast.error(message, { id: toastId })
          setIsRescheduling(false)
        }
      } catch {
        toast.error('Could not reschedule job', { id: toastId })
        setIsRescheduling(false)
      }
    },
    [data.companyId, onRescheduled]
  )

  const beginDrag = useCallback(
    (event: PointerEvent, job: ScheduleCalendarJob) => {
      const grid = gridRef.current
      if (!grid) return false

      const columnWidth = (grid.clientWidth - 56) / 7

      dragRef.current = {
        job,
        pointerId: event.pointerId,
        durationMinutes: job.durationMinutes,
        originDayIndex: job.dayIndex,
        originStartMinutes: job.startMinutes,
        currentDayIndex: job.dayIndex,
        currentStartMinutes: job.startMinutes,
        columnWidth,
      }

      setDragPreview({
        jobId: job.id,
        dayIndex: job.dayIndex,
        startMinutes: job.startMinutes,
      })

      return true
    },
    []
  )

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const intent = pointerIntentRef.current
      if (intent && intent.pointerId === event.pointerId && !dragRef.current) {
        const deltaX = Math.abs(event.clientX - intent.startX)
        const deltaY = Math.abs(event.clientY - intent.startY)
        if (deltaX > DRAG_THRESHOLD_PX || deltaY > DRAG_THRESHOLD_PX) {
          if (!intent.job.isDraggable) {
            const reason = getScheduleJobDragBlockedReason(intent.job)
            if (reason) toast.message(reason)
            pointerIntentRef.current = null
            return
          }
          if (isInteractionLocked) {
            pointerIntentRef.current = null
            return
          }
          if (beginDrag(event, intent.job)) {
            pointerIntentRef.current = null
          }
        }
      }

      const drag = dragRef.current
      const grid = gridRef.current
      if (!drag || drag.pointerId !== event.pointerId || !grid) return

      const rect = grid.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      const dayIndex = Math.min(
        6,
        Math.max(0, Math.floor((x - 56) / drag.columnWidth))
      )
      const rawMinutes = calendarTopPxToMinutes(
        y,
        data.businessHours,
        pixelsPerHour
      )
      const snapped = snapCalendarMinutes(rawMinutes)
      const startMinutes = clampCalendarStartMinutes(
        snapped,
        drag.durationMinutes,
        data.businessHours
      )

      drag.currentDayIndex = dayIndex
      drag.currentStartMinutes = startMinutes
      setDragPreview({
        jobId: drag.job.id,
        dayIndex,
        startMinutes,
      })
    }

    const handlePointerUp = async (event: PointerEvent) => {
      const intent = pointerIntentRef.current
      if (intent && intent.pointerId === event.pointerId && !dragRef.current) {
        pointerIntentRef.current = null
        openJob(intent.job)
        return
      }

      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      const changed =
        drag.currentDayIndex !== drag.originDayIndex ||
        drag.currentStartMinutes !== drag.originStartMinutes

      const job = drag.job
      finishDrag()

      if (!changed || isInteractionLocked) return

      const day = data.days[drag.currentDayIndex]
      if (!day) return

      const newStartIso = buildIsoFromDayAndMinutes(
        day.dateStr,
        drag.currentStartMinutes,
        data.timezone
      )
      const newEndIso = buildIsoFromDayAndMinutes(
        day.dateStr,
        drag.currentStartMinutes + drag.durationMinutes,
        data.timezone
      )

      if (job.recurringRuleId) {
        setPendingReschedule({ job, newStartIso, newEndIso })
        return
      }

      await applyReschedule({ job, newStartIso, newEndIso }, 'instance')
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [
    applyReschedule,
    beginDrag,
    data,
    finishDrag,
    isInteractionLocked,
    openJob,
    pixelsPerHour,
  ])

  const handleJobPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    job: ScheduleCalendarJob
  ) => {
    if (isInteractionLocked) return

    event.preventDefault()
    pointerIntentRef.current = {
      job,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const renderJob = (job: ScheduleCalendarJob, isPreview = false) => {
    const preview = dragPreview?.jobId === job.id ? dragPreview : null
    const startMinutes = preview?.startMinutes ?? job.startMinutes
    const colors = getCrewColorClasses(job.colorIndex)
    const top = minutesToCalendarTopPx(startMinutes, data.businessHours, pixelsPerHour)
    const height = (job.durationMinutes / 60) * pixelsPerHour
    const href = scheduleJobHref(job)
    const isOpening = pendingHref === href
    const dragBlockedReason = getScheduleJobDragBlockedReason(job)

    return (
      <div
        key={isPreview ? `${job.id}-preview` : job.id}
        title={!job.isDraggable ? dragBlockedReason ?? undefined : undefined}
        className={cn(
          'absolute left-1 right-1 rounded-md border px-2 py-1 text-[11px] shadow-sm overflow-hidden select-none touch-none',
          colors.bg,
          colors.border,
          colors.ring,
          'text-white',
          job.isProjected && !isPreview && 'border-dashed opacity-90',
          isPreview ? 'opacity-70 ring-2 z-20 pointer-events-none' : 'z-10',
          !job.isDraggable && !isPreview && 'opacity-80',
          job.isDraggable && !isPreview && 'cursor-grab active:cursor-grabbing',
          !job.isDraggable && !isPreview && 'cursor-pointer',
          isOpening && 'ring-2 ring-white/80'
        )}
        style={{ top, height: Math.max(height, 28) }}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={isPreview ? undefined : (event) => handleJobPointerDown(event, job)}
      >
        {isOpening && !isPreview && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md bg-black/25">
            <Loader2 className="size-4 animate-spin text-white" />
          </div>
        )}

        <div className="relative z-10 pointer-events-none">
          <div className="flex items-start gap-1 min-w-0">
            {job.recurringRuleId && (
              <Repeat className="size-3 shrink-0 mt-0.5 opacity-90" aria-hidden />
            )}
            <div className="font-medium truncate flex-1">{job.title}</div>
          </div>
          <div className="truncate opacity-90">{job.crewName}</div>
          {job.isProjected && !isPreview && (
            <div className="truncate text-[10px] opacity-75 mt-0.5">Projected visit</div>
          )}
          {!job.isDraggable && !isPreview && !job.isProjected && (
            <div className="truncate text-[10px] opacity-75 mt-0.5">Tap to view</div>
          )}
        </div>
      </div>
    )
  }

  const showEmptyState = data.jobs.length === 0 && !isLoadingWeek && !isRescheduling
  const timelineHeightPx = timelineHours * pixelsPerHour

  return (
    <div className="relative flex flex-col min-h-0 h-full">
      <div
        className={cn(
          'grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b bg-muted/30 shrink-0 transition-opacity',
          isInteractionLocked && 'opacity-60'
        )}
      >
        <div />
        {data.days.map((day) => (
          <div
            key={day.dateStr}
            className={cn(
              'px-2 py-2 text-center border-l',
              day.isToday && 'bg-primary/5'
            )}
          >
            <div className="text-xs font-medium">{day.shortLabel}</div>
            <div className="text-[10px] text-muted-foreground truncate">{day.label}</div>
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        className={cn(
          'relative flex-1 min-h-0 overflow-hidden transition-opacity',
          isInteractionLocked && 'opacity-60 pointer-events-none'
        )}
      >
        {showEmptyState && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-8 text-center pointer-events-none">
            <div>
              <p className="text-sm text-muted-foreground">No jobs scheduled this week.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Jobs appear here when they fall within your business hours (
                {data.businessHours.start} – {data.businessHours.end}).
              </p>
            </div>
          </div>
        )}

        <div
          className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] relative h-full"
          style={{ minHeight: timelineHeightPx }}
        >
          <div className="relative border-r bg-muted/20 h-full">
            {data.hourLabels.map((label, index) => (
              <div
                key={label}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground"
                style={{ top: index * pixelsPerHour }}
              >
                {label}
              </div>
            ))}
          </div>

          {data.days.map((day) => (
            <div
              key={day.dateStr}
              className={cn(
                'relative border-l h-full',
                day.isToday && 'bg-primary/[0.03]'
              )}
            >
              {data.hourLabels.map((_, index) => (
                <div
                  key={index}
                  className="absolute left-0 right-0 border-t border-border/50 pointer-events-none"
                  style={{ top: index * pixelsPerHour }}
                />
              ))}

              {data.jobs
                .filter((job) => {
                  if (dragPreview?.jobId === job.id) return false
                  return job.dayIndex === day.dayIndex
                })
                .map((job) => renderJob(job))}

              {dragPreview?.dayIndex === day.dayIndex &&
                data.jobs
                  .filter((job) => job.id === dragPreview.jobId)
                  .map((job) => renderJob(job, true))}
            </div>
          ))}
        </div>

        {isRescheduling ? (
          <ScheduleLoadingOverlay message="Saving new time…" />
        ) : isLoadingWeek ? (
          <ScheduleLoadingOverlay message="Loading week…" />
        ) : null}
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center gap-3 px-3 py-2 border-t text-xs text-muted-foreground shrink-0',
          isInteractionLocked && 'opacity-70'
        )}
      >
        <span>Drag scheduled jobs to reschedule. Click any job for details.</span>
        {data.crews.map((crew) => {
          const colors = getCrewColorClasses(crew.colorIndex)
          return (
            <span key={crew.id} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-full border', colors.bg, colors.border)} />
              {crew.name}
            </span>
          )
        })}
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              'size-2.5 rounded-full border',
              getCrewColorClasses(-1).bg,
              getCrewColorClasses(-1).border
            )}
          />
          Unassigned
        </span>
        <span className="inline-flex items-center gap-1">
          <Repeat className="size-3" />
          Recurring
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-dashed border-muted-foreground/70" />
          Projected
        </span>
        {isLoadingWeek && (
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading week
          </span>
        )}
        {isRescheduling && (
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <Loader2 className="size-3 animate-spin" />
            Saving
          </span>
        )}
        {pendingHref && (
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <Loader2 className="size-3 animate-spin" />
            Opening job
          </span>
        )}
      </div>

      <Dialog
        open={pendingReschedule !== null}
        onOpenChange={(open) => {
          if (!open) setPendingReschedule(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule recurring visit</DialogTitle>
            <DialogDescription>
              Choose whether to move only this visit or shift the entire recurring series from
              this point forward.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingReschedule(null)}
              disabled={isRescheduling}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={isRescheduling || !pendingReschedule}
              onClick={() => {
                if (pendingReschedule) void applyReschedule(pendingReschedule, 'instance')
              }}
            >
              This visit only
            </Button>
            <Button
              disabled={isRescheduling || !pendingReschedule}
              onClick={() => {
                if (pendingReschedule) void applyReschedule(pendingReschedule, 'series')
              }}
            >
              All future visits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}