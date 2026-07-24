'use client'

import { useRouter } from 'next/navigation'
import { JobStatusBadge } from '@/components/dashboard/job-status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  formatPortalArrivalWindow,
  formatPortalJobDayHeading,
  isJobActiveNow,
  type PortalJob,
} from '@/lib/portal-jobs'
import { Calendar, ChevronRight, Clock, CreditCard, Users } from 'lucide-react'

export type PortalJobListItem = PortalJob

function JobRow({ job, timezone }: { job: PortalJob; timezone: string }) {
  const router = useRouter()
  const activeNow = isJobActiveNow(job)

  const openJob = () => router.push(`/portal/jobs/${job.id}`)
  const openPayment = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(`/portal/jobs/${job.id}?pay=1`)
  }

  const dayLabel = formatPortalJobDayHeading(job.startTime, timezone)
  const arrivalWindow = formatPortalArrivalWindow(job.startTime, job.endTime, timezone)

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={openJob}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openJob()
        }
      }}
      className={`p-4 sm:p-5 shadow-sm cursor-pointer transition-colors hover:bg-muted/40 hover:border-primary/30 group ${
        activeNow ? 'border-primary/30 bg-primary/5' : ''
      }`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`rounded-lg p-2.5 shrink-0 ${
              activeNow ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            <Calendar className="size-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {activeNow ? (
                <Badge className="gap-1">
                  <span className="size-1.5 rounded-full bg-current animate-pulse" />
                  In progress
                </Badge>
              ) : (
                <Badge variant="secondary">{dayLabel}</Badge>
              )}
              <JobStatusBadge status={job.status} />
            </div>

            <h3 className="font-semibold text-base sm:text-lg mt-2 group-hover:text-primary transition-colors">
              {job.title}
            </h3>

            <div className="mt-3 space-y-1.5 text-sm">
              <p className="inline-flex items-center gap-2 font-medium">
                <Clock className="size-4 shrink-0 text-muted-foreground" />
                {arrivalWindow}
              </p>
              <p className="inline-flex items-center gap-2 text-muted-foreground">
                <Users className="size-4 shrink-0" />
                {job.crew?.name || 'Crew to be assigned'}
              </p>
            </div>

            {(job.canPay || job.isPaid) && (
              <p className="mt-2 text-sm font-medium">
                {job.canPay ? (
                  <span className="text-orange-600">{job.amountDueNowFormatted} due</span>
                ) : (
                  <span className="text-green-700">Paid in full</span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            size="lg"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              openJob()
            }}
            className="w-full sm:w-auto gap-1"
          >
            View details
            <ChevronRight className="size-4" />
          </Button>
          {job.canPay && (
            <Button size="lg" onClick={openPayment} className="w-full sm:w-auto gap-2">
              <CreditCard className="size-4" />
              Pay {job.amountDueNowFormatted}
            </Button>
          )}
        </div>
      </div>
    </Card>
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
      <div className="py-12 text-center text-sm text-muted-foreground px-4">{emptyMessage}</div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} timezone={timezone} />
      ))}
    </div>
  )
}