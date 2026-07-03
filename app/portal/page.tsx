import Link from 'next/link'
import { Card } from '@/components/ui/card'

import { PortalPageHeader } from '@/components/portal/portal-page-header'
import { PortalStatCard } from '@/components/portal/portal-stat-card'
import { getPortalHomeData } from '@/app/portal/actions'
import { CalendarDays, FileText, Wallet, ArrowRight } from 'lucide-react'

export default async function PortalHomePage() {
  const data = await getPortalHomeData()

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <PortalPageHeader
        title="Overview"
        description="Your upcoming work, open estimates, and account balance at a glance."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
        <PortalStatCard
          label="Upcoming jobs"
          value={String(data.upcomingJobCount)}
          icon={CalendarDays}
        />
        <PortalStatCard
          label="Balance due"
          value={data.balanceDueFormatted}
          icon={Wallet}
          highlight={data.balanceDue > 0}
        />
        <PortalStatCard
          label="Estimates to review"
          value={String(data.pendingEstimatesCount)}
          icon={FileText}
          highlight={data.pendingEstimatesCount > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <Card className="p-5 flex flex-col shadow-sm min-h-0">
          <h2 className="font-semibold text-lg tracking-tight">Next appointment</h2>
          {data.nextJob ? (
            <div className="mt-4 flex flex-col flex-1">
              <p className="font-medium">{data.nextJob.title}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {new Date(data.nextJob.start_time).toLocaleString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
              <div className="mt-auto pt-4">
                <Link
                  href={`/portal/jobs/${data.nextJob.id}`}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
                >
                  View job details
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4">
              No upcoming appointments scheduled.
            </p>
          )}
        </Card>

        <Card className="p-5 flex flex-col shadow-sm">
          <h2 className="font-semibold text-lg tracking-tight">Quick actions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Jump to the section you need.
          </p>
          <div className="mt-4 grid gap-2">
            <Link
              href="/portal/jobs"
              className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <span className="font-medium">View all jobs</span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
            <Link
              href="/portal/estimates"
              className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <span className="font-medium">Review estimates</span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
            <Link
              href="/portal/documents"
              className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <span className="font-medium">Download documents</span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          </div>
          {data.balanceDue > 0 && (
            <div className="mt-4 rounded-lg bg-orange-50 border border-orange-200 p-4 text-sm">
              <p className="font-medium text-orange-900">Payment due</p>
              <p className="text-orange-800 mt-0.5">
                You have {data.balanceDueFormatted} outstanding. Open a job to pay online.
              </p>
              <Link
                href="/portal/jobs"
                className="inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium hover:bg-muted mt-3"
              >
                Go to jobs
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}