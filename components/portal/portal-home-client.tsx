'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PortalActivityInbox } from '@/components/portal/portal-activity-inbox'
import { PortalBillingOverviewCard } from '@/components/portal/portal-billing-overview-card'
import { PortalCrewCard } from '@/components/portal/portal-crew-card'
import { PortalPayDialog } from '@/components/portal/portal-pay-dialog'
import { PortalScheduleHero } from '@/components/portal/portal-schedule-hero'
import { PortalPageHeader } from '@/components/portal/portal-page-header'
import { usePortalCrewTerminology } from '@/components/portal/portal-shell-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { PortalActivityItem } from '@/lib/portal-activity'
import {
  formatPortalArrivalWindow,
  type PortalBillingOverview,
  type PortalJob,
  type PortalPayableJob,
} from '@/lib/portal-jobs'
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
  billingOverview: PortalBillingOverview
}

function UpcomingJobRow({
  job,
  timezone,
  crewFallback,
}: {
  job: PortalJob
  timezone: string
  crewFallback: string
}) {
  return (
    <Link
      href={`/portal/jobs/${job.id}`}
      className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{job.title}</p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-3.5 shrink-0" />
          {formatPortalArrivalWindow(job.startTime, job.endTime, timezone)}
        </p>
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="size-3.5 shrink-0" />
          {job.crew?.name || crewFallback}
        </p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}

function ReadyToPayCard({
  balanceDueFormatted,
  paySubtitle,
  onPay,
}: {
  balanceDueFormatted: string
  paySubtitle: string
  onPay: () => void
}) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Ready to pay</p>
          <p className="text-3xl font-bold leading-none tracking-tight sm:text-4xl">
            {balanceDueFormatted}
          </p>
          <p className="pt-1 text-sm text-muted-foreground">{paySubtitle}</p>
        </div>
        <Button
          size="lg"
          className="w-full shrink-0 gap-2 sm:w-auto"
          onClick={onPay}
        >
          <CreditCard className="size-4" />
          Pay now
        </Button>
      </div>
    </Card>
  )
}

function EmptyReadyToPayCard() {
  return (
    <Card className="border-dashed shadow-sm">
      <div className="space-y-1 p-5 sm:p-6">
        <p className="text-sm font-medium text-muted-foreground">Ready to pay</p>
        <p className="text-2xl font-semibold tracking-tight">$0.00</p>
        <p className="text-sm text-muted-foreground">
          Nothing is due right now. You&apos;ll see a Pay button when a balance is ready.
        </p>
      </div>
    </Card>
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
  billingOverview,
}: PortalHomeClientProps) {
  const terms = usePortalCrewTerminology()
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const nextVisit = upcomingJobs[0] ?? null
  const laterVisits = upcomingJobs.slice(1)
  /** Prefer upcoming for crew intro; fall back to active job in progress. */
  const crewJob = nextVisit ?? activeJobs[0] ?? null
  const hasBalance = balanceDue > 0 && payableJobs.length > 0
  const hasNoVisits = activeJobs.length === 0 && !nextVisit
  const crewTbd = `${terms.singular} TBD`

  const paySubtitle =
    payableJobs.length === 1
      ? payableJobs[0].title
      : payableJobs.length > 1
        ? `${payableJobs.length} visits ready to pay`
        : 'No balance due'

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 pb-6">
      <PortalPageHeader
        title="Your visits"
        description={`See who's coming, when they'll arrive, and pay balances in seconds.`}
      >
        <PortalActivityInbox items={activity} timezone={timezone} />
      </PortalPageHeader>

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
                  className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                >
                  Full job details
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 lg:gap-8">
        {/* Left: schedule + crew */}
        <div className="flex min-w-0 flex-col gap-6">
          {nextVisit ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">Next visit</h2>
              <PortalScheduleHero job={nextVisit} timezone={timezone} />
            </section>
          ) : hasNoVisits ? (
            <Card className="p-8 text-center shadow-sm">
              <CalendarDays className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">No visits scheduled right now</p>
              <p className="mt-1 text-sm text-muted-foreground">
                When your provider schedules work, you&apos;ll see{' '}
                {terms.singularLower} and arrival times here.
              </p>
            </Card>
          ) : null}

          <PortalCrewCard job={crewJob} />

          {laterVisits.length > 0 && (
            <Card className="p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Coming up</h2>
                  <p className="text-sm text-muted-foreground">
                    {upcomingJobCount} scheduled {upcomingJobCount === 1 ? 'visit' : 'visits'}
                  </p>
                </div>
                <Link
                  href="/portal/jobs"
                  className="shrink-0 text-sm font-medium hover:underline"
                >
                  All jobs
                </Link>
              </div>
              <div className="space-y-2">
                {laterVisits.map((job) => (
                  <UpcomingJobRow
                    key={job.id}
                    job={job}
                    timezone={timezone}
                    crewFallback={crewTbd}
                  />
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right: billing column */}
        <div className="flex min-w-0 flex-col gap-6">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">Billing</h2>
            {hasBalance ? (
              <ReadyToPayCard
                balanceDueFormatted={balanceDueFormatted}
                paySubtitle={paySubtitle}
                onPay={() => setPayDialogOpen(true)}
              />
            ) : (
              <EmptyReadyToPayCard />
            )}
          </section>

          <PortalBillingOverviewCard overview={billingOverview} timezone={timezone} />
        </div>
      </div>
    </div>
  )
}
