import Link from 'next/link'
import { PortalInstallmentSchedule } from '@/components/portal/portal-installment-schedule'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatPortalJobDate, type PortalBillingOverview } from '@/lib/portal-jobs'
import { ArrowRight, Receipt } from 'lucide-react'

type PortalBillingOverviewCardProps = {
  overview: PortalBillingOverview
  timezone: string
}

function SummaryTile({
  label,
  value,
  highlight,
  hint,
}: {
  label: string
  value: string
  highlight?: boolean
  hint?: string
}) {
  return (
    <div className="rounded-lg border bg-background/80 p-3 sm:p-3.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1.5 text-lg font-semibold tracking-tight sm:text-xl ${
          highlight ? 'text-orange-600 dark:text-orange-400' : ''
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function PortalBillingOverviewCard({
  overview,
  timezone,
}: PortalBillingOverviewCardProps) {
  const hasJobs = overview.jobs.length > 0
  const hasPayments = overview.recentPayments.length > 0
  const showDueNow =
    overview.amountDueNow > 0 || overview.jobs.some((job) => job.hasPaymentPlan)

  return (
    <Card className="overflow-hidden shadow-sm">
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">All billing</h2>
            <p className="text-sm text-muted-foreground">
              Payment plans, visit charges, and recent payments in one place.
            </p>
          </div>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Receipt className="size-5" />
          </div>
        </div>

        <div
          className={`grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2 ${
            showDueNow ? 'xl:grid-cols-4' : 'xl:grid-cols-3'
          }`}
        >
          <SummaryTile label="Billed" value={overview.totalChargedFormatted} />
          <SummaryTile label="Paid" value={overview.totalPaidFormatted} />
          {showDueNow ? (
            <SummaryTile
              label="Due now"
              value={overview.amountDueNowFormatted}
              highlight={overview.amountDueNow > 0}
              hint="Ready to collect"
            />
          ) : null}
          <SummaryTile
            label="Outstanding"
            value={overview.balanceDueFormatted}
            highlight={!showDueNow && overview.balanceDue > 0}
            hint={
              showDueNow && overview.balanceDue > overview.amountDueNow
                ? 'Includes later installments'
                : undefined
            }
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Visits with charges</h3>
            <Link
              href="/portal/jobs"
              className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              All jobs
            </Link>
          </div>

          {hasJobs ? (
            <ul className="space-y-2.5">
              {overview.jobs.slice(0, 6).map((job) => {
                const href =
                  job.canPay && job.amountDueNow > 0
                    ? `/portal/jobs/${job.id}?pay=1`
                    : `/portal/jobs/${job.id}`
                const hasPlan = job.installments.length > 0

                return (
                  <li key={job.id}>
                    <Link
                      href={href}
                      className="block rounded-xl border bg-card p-3.5 transition-colors hover:bg-muted/40 sm:p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold">{job.title}</p>
                            {hasPlan ? (
                              <Badge variant="outline" className="text-[11px]">
                                Payment plan
                              </Badge>
                            ) : job.displayAmountKind === 'paid' ? (
                              <Badge variant="outline" className="text-[11px]">
                                Paid
                              </Badge>
                            ) : job.displayAmountKind === 'due_now' ? (
                              <Badge variant="secondary" className="text-[11px]">
                                Due now
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatPortalJobDate(job.startTime, timezone)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          <div className="text-right">
                            <p
                              className={`text-sm font-semibold tabular-nums ${
                                job.displayAmountKind === 'due_now'
                                  ? 'text-orange-600 dark:text-orange-400'
                                  : job.displayAmountKind === 'paid'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : ''
                              }`}
                            >
                              {job.displayAmountFormatted}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {job.displayAmountKind === 'due_now'
                                ? 'due now'
                                : job.displayAmountKind === 'outstanding'
                                  ? 'remaining'
                                  : job.displayAmountKind === 'paid'
                                    ? 'paid'
                                    : 'billed'}
                            </p>
                          </div>
                          <ArrowRight className="mt-0.5 size-4 text-muted-foreground" />
                        </div>
                      </div>

                      {hasPlan ? (
                        <PortalInstallmentSchedule
                          installments={job.installments}
                          className="mt-3"
                        />
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              No charges yet. When invoices are posted for your visits, they will show up here.
            </div>
          )}
        </div>

        {hasPayments ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Recent payments</h3>
            <ul className="divide-y rounded-lg border">
              {overview.recentPayments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-3 sm:px-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{payment.jobTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(payment.paymentDate + 'T12:00:00').toLocaleDateString([], {
                        timeZone: timezone,
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      {payment.source ? ` · ${payment.source}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {payment.amountFormatted}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
