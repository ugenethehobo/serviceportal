'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PortalActivityCard } from '@/components/portal/portal-activity-card'
import { PortalPayDialog } from '@/components/portal/portal-pay-dialog'
import { PortalScheduleHero } from '@/components/portal/portal-schedule-hero'
import { PortalPageHeader } from '@/components/portal/portal-page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { PortalActivityItem } from '@/lib/portal-activity'
import { formatPortalArrivalWindow, type PortalJob, type PortalPayableJob } from '@/lib/portal-jobs'
import {
  ArrowRight,
  CalendarDays,
  Clock,
  CreditCard,
  Users,
} from 'lucide-react'

type PortalHomeClientProps = {
  clientId: string
  timezone: string
  activeJobs: PortalJob[]
  upcomingJobs: PortalJob[]
  upcomingJobCount: number
  balanceDue: number
  balanceDueFormatted: string
  payableJobs: PortalPayableJob[]
  activity: PortalActivityItem[]
}

function UpcomingJobRow({ job, timezone }: { job: PortalJob; timezone: string }) {
  return (
    <Link
      href={`/portal/jobs/${job.id}`}
      className="flex items-center gap-4 rounded-lg border p-4 hover:bg-muted/40 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{job.title}</p>
        <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" />
          {formatPortalArrivalWindow(job.startTime, job.endTime, timezone)}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5 inline-flex items-center gap-1.5">
          <Users className="size-3.5 shrink-0" />
          {job.crew?.name || 'Crew TBD'}
        </p>
      </div>
      <ArrowRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  )
}

export function PortalHomeClient({
  clientId,
  timezone,
  activeJobs,
  upcomingJobs,
  upcomingJobCount,
  balanceDue,
  balanceDueFormatted,
  payableJobs,
  activity,
}: PortalHomeClientProps) {
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const nextVisit = upcomingJobs[0] ?? null
  const laterVisits = upcomingJobs.slice(1)
  const hasBalance = balanceDue > 0 && payableJobs.length > 0

  const paySubtitle =
    payableJobs.length === 1
      ? payableJobs[0].title
      : `${payableJobs.length} visits ready to pay`

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 pb-6">
      <PortalPageHeader
        title="Your visits"
        description="See who's coming, when they'll arrive, and pay balances in seconds."
      />

      {hasBalance && (
        <Card className="border-border bg-card shadow-sm">
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Ready to pay</p>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight leading-none">
                {balanceDueFormatted}
              </p>
              <p className="text-sm text-muted-foreground pt-1">{paySubtitle}</p>
            </div>
            <Button
              size="lg"
              className="w-full sm:w-auto shrink-0 gap-2"
              onClick={() => setPayDialogOpen(true)}
            >
              <CreditCard className="size-4" />
              Pay now
            </Button>
          </div>
        </Card>
      )}

      <PortalPayDialog
        open={payDialogOpen}
        onOpenChange={setPayDialogOpen}
        clientId={clientId}
        payableJobs={payableJobs}
        totalFormatted={balanceDueFormatted}
      />

      {activeJobs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Happening now</h2>
          {activeJobs.map((job) => (
            <div key={job.id} className="space-y-3">
              <PortalScheduleHero job={job} timezone={timezone} />
              <div className="flex justify-end">
                <Link
                  href={`/portal/jobs/${job.id}`}
                  className="text-sm font-medium inline-flex items-center gap-1 hover:underline"
                >
                  Full job details
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </section>
      )}

      <PortalActivityCard items={activity} timezone={timezone} />

      {nextVisit ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Next visit</h2>
          <PortalScheduleHero job={nextVisit} timezone={timezone} />
        </section>
      ) : activeJobs.length === 0 ? (
        <Card className="p-8 text-center shadow-sm">
          <CalendarDays className="size-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No visits scheduled right now</p>
          <p className="text-sm text-muted-foreground mt-1">
            When your provider schedules work, you&apos;ll see crew and arrival times here.
          </p>
        </Card>
      ) : null}

      {laterVisits.length > 0 && (
        <Card className="p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-lg">Coming up</h2>
              <p className="text-sm text-muted-foreground">
                {upcomingJobCount} scheduled {upcomingJobCount === 1 ? 'visit' : 'visits'}
              </p>
            </div>
            <Link href="/portal/jobs" className="text-sm font-medium hover:underline shrink-0">
              All jobs
            </Link>
          </div>
          <div className="space-y-2">
            {laterVisits.map((job) => (
              <UpcomingJobRow key={job.id} job={job} timezone={timezone} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}