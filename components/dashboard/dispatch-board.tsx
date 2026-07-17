'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  MapPin,
  UserRound,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getDispatchBoardAction,
  reassignDispatchJobAction,
} from '@/app/dispatch-actions'
import type {
  DispatchBoardData,
  DispatchColumn,
  DispatchJobCard,
} from '@/lib/dispatch-board'
import {
  DISPATCH_UNASSIGNED_COLUMN_ID,
  getDispatchPageDescription,
  getDispatchPageTitle,
  isDispatchJobEditableByViewer,
} from '@/lib/dispatch-board'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MOBILE_FULL_WIDTH_BUTTON_CLASS,
  MOBILE_SELECT_TRIGGER_CLASS,
} from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'

type DispatchBoardProps = {
  /** Compact copy when embedded in Crews / Team page tabs. */
  embedded?: boolean
}

function statusBadgeClass(displayStatus: string): string {
  switch (displayStatus) {
    case 'Completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    case 'In Progress':
      return 'border-sky-200 bg-sky-50 text-sky-800'
    case 'Scheduled':
      return 'border-amber-200 bg-amber-50 text-amber-900'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

function DispatchJobCardView({
  job,
  isSoloBusiness,
  assignOptions,
  isDragging,
  onDragStart,
  onAssign,
  disabled,
}: {
  job: DispatchJobCard
  isSoloBusiness: boolean
  assignOptions: { value: string; label: string }[]
  isDragging: boolean
  onDragStart: (jobId: string) => void
  onAssign: (job: DispatchJobCard, targetColumnId: string) => void
  disabled: boolean
}) {
  const canDrag = job.draggable && !disabled
  const currentColumnId = job.crewId ?? DISPATCH_UNASSIGNED_COLUMN_ID
  const helperCount = job.helperCount ?? 0

  return (
    <div
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) {
          e.preventDefault()
          return
        }
        e.dataTransfer.setData('text/plain', job.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(job.id)
      }}
      className={cn(
        'rounded-lg border bg-card p-3 shadow-sm transition-opacity',
        canDrag && 'cursor-grab active:cursor-grabbing',
        !canDrag && 'opacity-80',
        isDragging && 'opacity-50',
        job.hasCrewConflict && 'border-amber-300 ring-1 ring-amber-200'
      )}
    >
      <div className="flex items-start gap-2">
        {canDrag ? (
          <GripVertical
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        ) : (
          <span className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={job.href}
              className="truncate text-sm font-semibold text-foreground hover:underline"
            >
              {job.title}
            </Link>
            <Badge
              variant="outline"
              className={cn('text-[10px]', statusBadgeClass(job.displayStatus))}
            >
              {job.displayStatus}
            </Badge>
            {job.hasCrewConflict ? (
              <Badge
                variant="outline"
                className="gap-0.5 border-amber-300 bg-amber-50 text-[10px] text-amber-900"
              >
                <AlertTriangle className="size-3" />
                Conflict
              </Badge>
            ) : null}
            {helperCount > 0 ? (
              <Badge variant="secondary" className="text-[10px]">
                +{helperCount} helper{helperCount === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {job.startLabel}
            {' – '}
            {job.endLabel}
          </p>
          <p className="truncate text-xs text-muted-foreground">{job.clientName}</p>
          {job.location ? (
            <p className="flex items-start gap-1 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 size-3 shrink-0" />
              <span className="line-clamp-2">{job.location}</span>
            </p>
          ) : null}

          {canDrag ? (
            <div className="pt-1 md:hidden">
              <Select
                value={currentColumnId}
                onValueChange={(value) => {
                  if (!value || value === currentColumnId) return
                  onAssign(job, value)
                }}
                disabled={disabled}
              >
                <SelectTrigger
                  className={cn(
                    'h-11 w-full min-h-11 text-xs',
                    MOBILE_SELECT_TRIGGER_CLASS
                  )}
                  size="sm"
                >
                  <SelectValue
                    placeholder={isSoloBusiness ? 'Schedule…' : 'Assign…'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {assignOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="min-h-11">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DispatchColumnView({
  column,
  isSoloBusiness,
  assignOptions,
  draggingJobId,
  dropTargetId,
  onDragStart,
  onDragOverColumn,
  onDropOnColumn,
  onAssign,
  disabled,
}: {
  column: DispatchColumn
  isSoloBusiness: boolean
  assignOptions: { value: string; label: string }[]
  draggingJobId: string | null
  dropTargetId: string | null
  onDragStart: (jobId: string) => void
  onDragOverColumn: (columnId: string) => void
  onDropOnColumn: (columnId: string) => void
  onAssign: (job: DispatchJobCard, targetColumnId: string) => void
  disabled: boolean
}) {
  const isDropTarget = dropTargetId === column.id && draggingJobId != null
  const isUnassigned = column.kind === 'unassigned'
  const Icon = isUnassigned || isSoloBusiness ? UserRound : Users
  const conflictCount = column.jobs.filter((j) => j.hasCrewConflict).length

  return (
    <div
      className={cn(
        'flex min-h-[280px] w-[min(100%,85vw)] max-w-[320px] shrink-0 flex-col rounded-xl border bg-muted/20 sm:w-[280px] sm:max-w-none',
        isDropTarget && 'border-primary bg-primary/5 ring-2 ring-primary/30'
      )}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOverColumn(column.id)
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDropOnColumn(column.id)
      }}
    >
      <div className="flex items-center gap-2 border-b bg-card/80 px-3 py-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {column.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {column.jobs.length} job{column.jobs.length === 1 ? '' : 's'}
            {conflictCount > 0 ? (
              <span className="text-amber-700">
                {' '}
                · {conflictCount} conflict
                {conflictCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {column.jobs.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            {isUnassigned
              ? isSoloBusiness
                ? 'No unscheduled work — drag jobs here to clear your day'
                : 'No unassigned jobs'
              : isSoloBusiness
                ? 'Drop jobs here to put them on your day'
                : 'Drop jobs here to assign'}
          </p>
        ) : (
          column.jobs.map((job) => (
            <DispatchJobCardView
              key={job.id}
              job={job}
              isSoloBusiness={isSoloBusiness}
              assignOptions={assignOptions}
              isDragging={draggingJobId === job.id}
              onDragStart={onDragStart}
              onAssign={onAssign}
              disabled={disabled}
            />
          ))
        )}
      </div>
    </div>
  )
}

export function DispatchBoard({ embedded = false }: DispatchBoardProps) {
  const [dayOffset, setDayOffset] = useState(0)
  const [board, setBoard] = useState<DispatchBoardData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const loadBoard = useCallback(async (offset: number) => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await getDispatchBoardAction(offset)
      if (!result.success) {
        setLoadError(result.error)
        setBoard(null)
        return
      }
      setBoard(result.data)
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load dispatch board'
      )
      setBoard(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBoard(dayOffset)
  }, [dayOffset, loadBoard])

  const assignOptions =
    board?.columns.map((column) => ({
      value: column.id,
      label: column.name,
    })) ?? []

  function findJob(jobId: string): DispatchJobCard | null {
    if (!board) return null
    for (const column of board.columns) {
      const job = column.jobs.find((j) => j.id === jobId)
      if (job) return job
    }
    return null
  }

  function applyReassign(job: DispatchJobCard, targetColumnId: string) {
    const currentColumnId = job.crewId ?? DISPATCH_UNASSIGNED_COLUMN_ID
    if (currentColumnId === targetColumnId) return

    startTransition(async () => {
      const result = await reassignDispatchJobAction({
        jobId: job.id,
        clientId: job.clientId,
        targetColumnId,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        board?.isSoloBusiness
          ? targetColumnId === DISPATCH_UNASSIGNED_COLUMN_ID
            ? 'Removed from your day'
            : 'Added to your day'
          : targetColumnId === DISPATCH_UNASSIGNED_COLUMN_ID
            ? 'Job unassigned'
            : 'Job assigned'
      )
      await loadBoard(dayOffset)
    })
  }

  function handleDropOnColumn(targetColumnId: string) {
    const jobId = draggingJobId
    setDraggingJobId(null)
    setDropTargetId(null)
    if (!jobId) return
    const job = findJob(jobId)
    if (!job) return
    applyReassign(job, targetColumnId)
  }

  const title = board
    ? getDispatchPageTitle(board.isSoloBusiness)
    : 'Dispatch'
  const description = board
    ? getDispatchPageDescription(board.isSoloBusiness, board.viewerMode)
    : 'Assign work for the day.'

  const viewer = board
    ? { mode: board.viewerMode, leadCrewId: board.leadCrewId }
    : { mode: 'admin' as const, leadCrewId: null }

  return (
    <div className="space-y-4">
      {!embedded ? (
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      ) : board && !board.isSoloBusiness && board.viewerMode === 'crew_lead' ? (
        <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="flex w-full items-center gap-1 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0 sm:size-8"
            disabled={loading || pending}
            onClick={() => setDayOffset((d) => d - 1)}
            aria-label="Previous day"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant={dayOffset === 0 ? 'secondary' : 'outline'}
            size="sm"
            className={cn(
              'min-w-0 flex-1 truncate sm:min-w-[9.5rem] sm:flex-none',
              MOBILE_FULL_WIDTH_BUTTON_CLASS
            )}
            disabled={loading || pending}
            onClick={() => setDayOffset(0)}
          >
            {board
              ? dayOffset === 0
                ? `Today · ${board.dayLabel}`
                : board.dayLabel
              : 'Today'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0 sm:size-8"
            disabled={loading || pending}
            onClick={() => setDayOffset((d) => d + 1)}
            aria-label="Next day"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {pending ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Updating…
          </span>
        ) : null}
      </div>

      {loadError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      {loading && !board ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-xl border bg-muted/20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : board ? (
        <div
          className="flex gap-3 overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] touch-pan-x"
          onDragEnd={() => {
            setDraggingJobId(null)
            setDropTargetId(null)
          }}
        >
          {board.columns.map((column) => {
            const columnJobs =
              board.viewerMode === 'crew_lead'
                ? {
                    ...column,
                    jobs: column.jobs.map((job) => ({
                      ...job,
                      draggable:
                        job.draggable &&
                        isDispatchJobEditableByViewer(job, viewer),
                    })),
                  }
                : column

            return (
              <DispatchColumnView
                key={column.id}
                column={columnJobs}
                isSoloBusiness={board.isSoloBusiness}
                assignOptions={
                  board.viewerMode === 'crew_lead' && board.leadCrewId
                    ? assignOptions.filter(
                        (opt) =>
                          opt.value === DISPATCH_UNASSIGNED_COLUMN_ID ||
                          opt.value === board.leadCrewId
                      )
                    : assignOptions
                }
                draggingJobId={draggingJobId}
                dropTargetId={dropTargetId}
                onDragStart={setDraggingJobId}
                onDragOverColumn={setDropTargetId}
                onDropOnColumn={handleDropOnColumn}
                onAssign={applyReassign}
                disabled={pending}
              />
            )
          })}
        </div>
      ) : null}

      {board && !loading ? (
        <p className="text-xs text-muted-foreground">
          {board.isSoloBusiness
            ? 'Drag jobs onto You to put them on your day, or to Unassigned to free the slot. On mobile, use the menu on each card.'
            : board.viewerMode === 'crew_lead'
              ? 'As lead, drag between Unassigned and your crew only. On mobile, use the assign menu. Open a job to add multi-tech helpers.'
              : 'Drag jobs between crews or Unassigned. On mobile, use the assign menu on each card. Travel-buffer conflicts are blocked. Add helpers on the job page when a stop needs more techs.'}
        </p>
      ) : null}
    </div>
  )
}
