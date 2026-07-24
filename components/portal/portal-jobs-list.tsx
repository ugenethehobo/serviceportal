'use client'

import { useRouter } from 'next/navigation'
import { PortalInstallmentSchedule } from '@/components/portal/portal-installment-schedule'
import { JobStatusBadge } from '@/components/dashboard/job-status-badge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePortalCrewTerminology } from '@/components/portal/portal-shell-context'
import {
  formatPortalArrivalWindow,
  formatPortalJobDayHeading,
  isJobActiveNow,
  portalDueNowLabel,
  type PortalJob,
} from '@/lib/portal-jobs'
import { cn } from '@/lib/utils'
import { Clock, CreditCard, MapPin, Users } from 'lucide-react'

export type PortalJobListItem = PortalJob

function JobRow({ job, timezone }: { job: PortalJob; timezone: string }) {
  const router = useRouter()
  const terms = usePortalCrewTerminology()
  const activeNow = isJobActiveNow(job)
  const dayLabel = formatPortalJobDayHeading(job.startTime, timezone)
  const arrivalWindow = formatPortalArrivalWindow(job.startTime, job.endTime, timezone)
  const installments = job.installments || []
  const hasPlan = Boolean(
    (job.planType && job.planType !== 'full_balance') || installments.length > 0
  )
  const dueLabel = portalDueNowLabel(job)

  const openJob = () => router.push(`/portal/jobs/${job.id}`)
  const openPayment = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(`/portal/jobs/${job.id}?pay=1`)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openJob}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openJob()
        }
      }}
      className={cn(
        'group cursor-pointer rounded-xl border bg-card p-4 shadow-sm transition-colors',
        'hover:border-primary/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        activeNow && 'border-primary/35 bg-primary/5'
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {activeNow ? (
              <Badge className="gap-1">
                <span className="size-1.5 animate-pulse rounded-full bg-current" />
                In progress
              </Badge>
            ) : (
              <Badge variant="secondary">{dayLabel}</Badge>
            )}
            <JobStatusBadge status={job.status} />
            {hasPlan ? (
              <Badge variant="outline" className="text-[11px]">
                Payment plan
              </Badge>
            ) : null}
            {job.isPaid ? (
              <Badge variant="outline" className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Paid
              </Badge>
            ) : null}
          </div>

          <div>
            <h3 className="text-base font-semibold tracking-tight transition-colors group-hover:text-primary sm:text-lg">
              {job.title}
            </h3>
            <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                {arrivalWindow}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5 shrink-0" />
                {job.crew?.name || `${terms.singular} TBD`}
              </span>
              {job.serviceAddress?.trim() ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="truncate">{job.serviceAddress}</span>
                </span>
              ) : null}
            </div>
          </div>

          {hasPlan && installments.length > 0 ? (
            <PortalInstallmentSchedule
              installments={installments}
              density="comfortable"
              className="max-w-lg"
            />
          ) : job.canPay ? (
            <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
              {job.amountDueNowFormatted} due
              {dueLabel ? ` · ${dueLabel}` : ''}
            </p>
          ) : job.balanceDue > 0 ? (
            <p className="text-sm text-muted-foreground">
              {job.balanceDueFormatted} remaining (not due yet)
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          {job.canPay ? (
            <Button size="default" onClick={openPayment} className="w-full gap-2 sm:w-auto">
              <CreditCard className="size-4" />
              Pay {job.amountDueNowFormatted}
            </Button>
          ) : null}
          <p className="text-center text-xs font-medium text-muted-foreground sm:text-right">
            View details →
          </p>
        </div>
      </div>
    </div>
  )
}

export function PortalJobsList({
  jobs,
  timezone,
  emptyMessage,
}: {
  jobs: PortalJob[]
  timezone: string
  emptyMessage: string
}) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} timezone={timezone} />
      ))}
    </div>
  )
}
