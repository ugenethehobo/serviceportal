'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getClientBillingAction } from '@/app/action'
import { formatCurrency } from '@/lib/billing'
import { Badge } from '@/components/ui/badge'
import { MainPageCard } from '@/components/ui/main-page-card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MobileListCard, MobileListCardRow } from '@/components/ui/mobile-list-card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StaffActivityCard } from '@/components/dashboard/staff-activity-card'
import { StripeConnectAlert } from '@/components/dashboard/stripe-connect-gate'
import type { ActivityFeedItem } from '@/lib/activity-feed'
import {
  MOBILE_LIST_STACK_CLASS,
  MOBILE_NATURAL_HEIGHT_CLASS,
  MOBILE_SCROLL_VIEWPORT_CLASS,
  MOBILE_TABLE_DESKTOP_ONLY_CLASS,
} from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ExternalLink } from 'lucide-react'

interface ClientBillingPanelProps {
  clientId: string
  activity?: ActivityFeedItem[]
  timezone?: string
}

export function ClientBillingPanel({
  clientId,
  activity = [],
  timezone = 'America/New_York',
}: ClientBillingPanelProps) {
  const router = useRouter()
  const [billing, setBilling] = useState<{
    summary: { totalCharged: number; totalPaid: number; balanceDue: number }
    jobs: Array<{
      scheduleId: string
      title: string
      startTime: string
      status: string
      summary: { totalCharged: number; totalPaid: number; balanceDue: number }
    }>
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchBilling = useCallback(async () => {
    const result = await getClientBillingAction(clientId)
    if (result.success && result.billing) {
      setBilling(
        result.billing as {
          summary: { totalCharged: number; totalPaid: number; balanceDue: number }
          jobs: Array<{
            scheduleId: string
            title: string
            startTime: string
            status: string
            summary: { totalCharged: number; totalPaid: number; balanceDue: number }
          }>
        }
      )
    } else {
      toast.error(result.error || 'Failed to load billing')
    }
    setIsLoading(false)
  }, [clientId])

  useEffect(() => {
    void fetchBilling()
  }, [fetchBilling])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading billing...</div>
  }

  if (!billing) {
    return <div className="text-sm text-muted-foreground">Unable to load billing data.</div>
  }

  const jobsWithBilling = billing.jobs.filter(
    (j) => j.summary.totalCharged > 0 || j.summary.totalPaid > 0
  )

  const activityColumn = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <StripeConnectAlert />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
        <StaffActivityCard
          items={activity}
          timezone={timezone}
          variant="client"
          embedded
          compact
          listClassName="h-full min-h-0 flex-1"
        />
      </div>
    </div>
  )

  const summaryStrip = (
    <div className="grid shrink-0 grid-cols-1 gap-3 min-[400px]:grid-cols-3 sm:gap-3">
      <SummaryCard label="Total billed" value={formatCurrency(billing.summary.totalCharged)} />
      <SummaryCard label="Total paid" value={formatCurrency(billing.summary.totalPaid)} />
      <SummaryCard
        label="Balance due"
        value={formatCurrency(billing.summary.balanceDue)}
        highlight={billing.summary.balanceDue > 0}
      />
    </div>
  )

  const jobsSection = (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Jobs with billing</h3>
          <p className="text-sm text-muted-foreground">
            Open a job to record cash or manage installments.
          </p>
        </div>
        <Link
          href="/dashboard/payments"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium hover:underline max-md:min-h-10"
        >
          All transactions
          <ExternalLink className="size-3.5" />
        </Link>
      </div>

      {jobsWithBilling.length > 0 ? (
        <>
          <ScrollArea
            className={cn(
              'min-h-0 flex-1 rounded-lg border',
              MOBILE_TABLE_DESKTOP_ONLY_CLASS
            )}
            viewportClassName="scroll-fade"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Charged</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobsWithBilling.map((job) => (
                  <TableRow key={job.scheduleId}>
                    <TableCell className="font-medium">{job.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(job.startTime).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {job.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(job.summary.totalCharged)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(job.summary.totalPaid)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium',
                        job.summary.balanceDue > 0 && 'text-orange-600'
                      )}
                    >
                      {formatCurrency(job.summary.balanceDue)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/clients/${clientId}/jobs/${job.scheduleId}?tab=billing`}
                        className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                      >
                        Open
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <div className={MOBILE_LIST_STACK_CLASS}>
            {jobsWithBilling.map((job) => (
              <MobileListCard
                key={job.scheduleId}
                onClick={() =>
                  router.push(
                    `/dashboard/clients/${clientId}/jobs/${job.scheduleId}?tab=billing`
                  )
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-base font-semibold leading-snug">{job.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(job.startTime).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 capitalize">
                    {job.status.replace('_', ' ')}
                  </Badge>
                </div>
                <MobileListCardRow
                  label="Charged"
                  value={formatCurrency(job.summary.totalCharged)}
                />
                <MobileListCardRow
                  label="Paid"
                  value={formatCurrency(job.summary.totalPaid)}
                />
                <MobileListCardRow
                  label="Balance"
                  value={
                    <span
                      className={
                        job.summary.balanceDue > 0 ? 'text-orange-600' : undefined
                      }
                    >
                      {formatCurrency(job.summary.balanceDue)}
                    </span>
                  }
                />
              </MobileListCard>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No billing activity yet. Add line items on individual job billing tabs.
        </div>
      )}
    </div>
  )

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-4',
        MOBILE_NATURAL_HEIGHT_CLASS
      )}
    >
      {/* Desktop: two page-level cards (replace the parent main card) */}
      <div className="hidden min-h-0 flex-1 gap-4 lg:grid lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <MainPageCard className="min-h-0 gap-0 overflow-hidden p-4 sm:p-5">
          {activityColumn}
        </MainPageCard>
        <MainPageCard className="min-h-0 gap-5 overflow-hidden p-4 sm:p-5">
          {summaryStrip}
          {jobsSection}
        </MainPageCard>
      </div>

      {/* Mobile / tablet: stacked page-level cards */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:hidden">
        <StripeConnectAlert />
        {summaryStrip}
        <MainPageCard className="max-h-[42vh] min-h-[14rem] gap-0 overflow-hidden p-0">
          <StaffActivityCard
            items={activity}
            timezone={timezone}
            variant="client"
            embedded
            compact
            listClassName="h-full min-h-0 flex-1"
          />
        </MainPageCard>
        <MainPageCard className="min-h-0 flex-1 gap-4 p-4 sm:p-5">
          {jobsSection}
        </MainPageCard>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3.5 py-3 sm:px-4 sm:py-3.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-lg font-semibold tracking-tight tabular-nums sm:text-xl',
          highlight && 'text-orange-600'
        )}
      >
        {value}
      </div>
    </div>
  )
}
