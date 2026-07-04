import Link from 'next/link'
import { JobStatusBadge } from '@/components/dashboard/job-status-badge'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  formatPortalArrivalWindow,
  formatPortalJobDayHeading,
  isJobActiveNow,
  type PortalJob,
} from '@/lib/portal-jobs'
import { Clock, CreditCard, MapPin, Users } from 'lucide-react'

type PortalScheduleHeroProps = {
  job: Pick<
    PortalJob,
    | 'id'
    | 'title'
    | 'status'
    | 'startTime'
    | 'endTime'
    | 'crew'
    | 'serviceAddress'
    | 'canPay'
    | 'balanceDueFormatted'
  >
  timezone: string
  variant?: 'featured' | 'compact'
  showPayButton?: boolean
}

export function PortalScheduleHero({
  job,
  timezone,
  variant = 'featured',
  showPayButton = true,
}: PortalScheduleHeroProps) {
  const activeNow = isJobActiveNow(
    { status: job.status, startTime: job.startTime, endTime: job.endTime },
    new Date()
  )
  const dayHeading = formatPortalJobDayHeading(job.startTime, timezone)
  const arrivalWindow = formatPortalArrivalWindow(job.startTime, job.endTime, timezone)
  const crewName = job.crew?.name || 'Crew being assigned'
  const hasAddress = !!job.serviceAddress?.trim()

  if (variant === 'compact') {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={activeNow ? 'default' : 'secondary'}>
            {activeNow ? 'In progress' : dayHeading}
          </Badge>
          <JobStatusBadge status={job.status} />
        </div>
        <p className="inline-flex items-center gap-1.5 font-medium">
          <Clock className="size-3.5 shrink-0 text-muted-foreground" />
          {arrivalWindow}
        </p>
        <p className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Users className="size-3.5 shrink-0" />
          {crewName}
        </p>
      </div>
    )
  }

  return (
    <Card
      className={`overflow-hidden shadow-sm ${
        activeNow ? 'border-primary/40 bg-primary/5' : ''
      }`}
    >
      <div className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {activeNow ? (
                <Badge className="gap-1">
                  <span className="size-1.5 rounded-full bg-current animate-pulse" />
                  Happening now
                </Badge>
              ) : (
                <Badge variant="secondary">{dayHeading}</Badge>
              )}
              <JobStatusBadge status={job.status} />
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">{job.title}</h2>
          </div>

          {showPayButton && job.canPay && (
            <Link
              href={`/portal/jobs/${job.id}?pay=1`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80 w-full sm:w-auto shrink-0"
            >
              <CreditCard className="size-4" />
              Pay {job.balanceDueFormatted}
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border bg-background/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Arrival window
            </p>
            <p className="mt-2 text-lg font-semibold inline-flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground shrink-0" />
              {arrivalWindow}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Your crew is scheduled during this time.
            </p>
          </div>

          <div className="rounded-lg border bg-background/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Assigned crew
            </p>
            <p className="mt-2 text-lg font-semibold inline-flex items-center gap-2">
              <Users className="size-4 text-muted-foreground shrink-0" />
              {crewName}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {job.crew ? 'This team is assigned to your visit.' : 'Your provider will confirm the crew shortly.'}
            </p>
          </div>
        </div>

        {hasAddress && (
          <div className="rounded-lg border bg-background/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              Service location
            </p>
            <p className="mt-2 text-sm leading-relaxed">{job.serviceAddress}</p>
          </div>
        )}
      </div>
    </Card>
  )
}