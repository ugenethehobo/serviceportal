'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { getReportsDataAction } from '@/app/action'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { MainPageCard, MainPageCardScroll } from '@/components/ui/main-page-card'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoadingSkeleton } from '@/components/ui/page-loading-skeleton'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AR_AGING_BUCKET_LABELS } from '@/lib/ar-aging'
import { formatReportsCurrency, REPORTS_PERIOD_LABELS, type ReportsData, type ReportsPeriod } from '@/lib/reports'

const revenueChartConfig = {
  billed: {
    label: 'Billed',
    color: 'var(--chart-1)',
  },
  collected: {
    label: 'Collected',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

function SummaryCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string
  value: string
  hint?: string
  highlight?: boolean
}) {
  return (
    <Card className="p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tracking-tight mt-1 ${highlight ? 'text-orange-600' : ''}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </Card>
  )
}

export function ReportsPageClient() {
  const [period, setPeriod] = useState<ReportsPeriod>('30d')
  const [data, setData] = useState<ReportsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchReports = useCallback(async (selectedPeriod: ReportsPeriod) => {
    setIsLoading(true)
    const result = await getReportsDataAction(selectedPeriod)
    if (result.success) {
      setData(result.data)
      setError(null)
    } else {
      setError(result.error)
      setData(null)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchReports(period)
  }, [period, fetchReports])

  return (
    <div className="p-6 flex flex-col h-full min-h-0">
      <PageHeader
        title="Reports"
        description="Revenue, collections, job activity, and outstanding balances"
        actions={
          <Select
            value={period}
            onValueChange={(value) => setPeriod((value ?? '30d') as ReportsPeriod)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(REPORTS_PERIOD_LABELS) as ReportsPeriod[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {REPORTS_PERIOD_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <MainPageCard className="p-6">
        {error ? (
          <EmptyState
            title="Could not load reports"
            description={error}
            onRetry={() => void fetchReports(period)}
          />
        ) : isLoading || !data ? (
          <PageLoadingSkeleton variant="cards" />
        ) : (
          <MainPageCardScroll contentClassName="flex flex-col gap-6 pr-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard
              label="Billed"
              value={formatReportsCurrency(data.summary.totalBilled)}
              hint={`Completed jobs · ${data.periodLabel.toLowerCase()}`}
            />
            <SummaryCard
              label="Collected"
              value={formatReportsCurrency(data.summary.totalCollected)}
              hint={data.periodLabel}
            />
            <SummaryCard
              label="Outstanding"
              value={formatReportsCurrency(data.summary.balanceDue)}
              hint="Open job balances from line items"
              highlight={data.summary.balanceDue > 0}
            />
            <SummaryCard
              label="Jobs completed"
              value={String(data.summary.jobsCompleted)}
              hint={data.periodLabel}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard
              label="Open jobs"
              value={String(data.summary.jobsScheduled)}
              hint="Scheduled or in progress"
            />
            <SummaryCard
              label="Active clients"
              value={String(data.summary.activeClients)}
            />
            <SummaryCard
              label="Leads converted"
              value={String(data.summary.leadsConverted)}
              hint={data.periodLabel}
            />
            <SummaryCard
              label="Estimates sent"
              value={String(data.summary.estimatesSent)}
              hint={data.periodLabel}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="p-5 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight mb-1">Revenue trend</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Completed job revenue vs collections by month ({data.periodLabel.toLowerCase()})
              </p>
              {data.revenueByMonth.length > 0 ? (
                <ChartContainer
                  config={revenueChartConfig}
                  className="aspect-auto h-72 w-full"
                  initialDimension={{ width: 640, height: 288 }}
                >
                  <BarChart data={data.revenueByMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="monthLabel"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(value) =>
                        value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`
                      }
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) =>
                            formatReportsCurrency(typeof value === 'number' ? value : Number(value) || 0)
                          }
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="billed" fill="var(--color-billed)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="collected" fill="var(--color-collected)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="h-72 flex items-center justify-center border border-dashed rounded-lg text-sm text-muted-foreground">
                  No billing activity in this period yet.
                </div>
              )}
            </Card>

            <Card className="p-5 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight mb-1">Jobs by status</h2>
              <p className="text-sm text-muted-foreground mb-4">Current job pipeline snapshot</p>
              {data.jobsByStatus.length > 0 ? (
                <div className="space-y-3">
                  {data.jobsByStatus.map((item) => {
                    const total = data.jobsByStatus.reduce((sum, row) => sum + row.count, 0)
                    const width = total > 0 ? Math.round((item.count / total) * 100) : 0
                    return (
                      <div key={item.status}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>{item.label}</span>
                          <span className="text-muted-foreground">{item.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/80 transition-all"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="h-72 flex items-center justify-center border border-dashed rounded-lg text-sm text-muted-foreground">
                  No jobs yet.
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">AR aging</h2>
                <p className="text-sm text-muted-foreground">
                  Outstanding invoices by age since issue date
                </p>
              </div>
              {data.arAging.totalOutstanding > 0 && (
                <Badge variant="outline" className="text-orange-600 border-orange-500/40">
                  {formatReportsCurrency(data.arAging.totalOutstanding)} total
                </Badge>
              )}
            </div>

            {data.arAging.totalOutstanding > 0 ? (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                  {data.arAging.buckets.map((bucket) => (
                    <div
                      key={bucket.bucket}
                      className="rounded-lg border bg-muted/20 px-4 py-3"
                    >
                      <p className="text-xs text-muted-foreground">{bucket.label}</p>
                      <p className="text-lg font-semibold mt-1">
                        {formatReportsCurrency(bucket.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {bucket.invoiceCount} invoice{bucket.invoiceCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr className="text-left">
                        <th className="p-3 font-medium">Client</th>
                        <th className="p-3 font-medium">Job</th>
                        <th className="p-3 font-medium">Age</th>
                        <th className="p-3 font-medium text-right">Amount due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.arAging.invoices.slice(0, 25).map((row) => (
                        <tr key={row.scheduleId} className="border-t">
                          <td className="p-3">
                            <Link
                              href={`/dashboard/clients/${row.clientId}`}
                              className="font-medium hover:underline"
                            >
                              {row.clientName}
                            </Link>
                          </td>
                          <td className="p-3">
                            <Link
                              href={`/dashboard/clients/${row.clientId}/jobs/${row.scheduleId}?tab=billing`}
                              className="hover:underline text-muted-foreground"
                            >
                              {row.jobTitle}
                            </Link>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={
                                row.bucket === 'over_90'
                                  ? 'text-red-600 border-red-500/40'
                                  : row.bucket === 'current'
                                    ? 'text-emerald-600 border-emerald-500/40'
                                    : 'text-orange-600 border-orange-500/40'
                              }
                            >
                              {row.daysOutstanding}d · {AR_AGING_BUCKET_LABELS[row.bucket].split(' ')[0]}
                            </Badge>
                          </td>
                          <td className="p-3 text-right font-medium text-orange-600">
                            {formatReportsCurrency(row.balanceDue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.arAging.invoices.length > 25 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Showing 25 of {data.arAging.invoices.length} outstanding invoices.
                  </p>
                )}
              </>
            ) : (
              <div className="py-12 text-center border border-dashed rounded-lg text-sm text-muted-foreground">
                No outstanding invoices — AR is current.
              </div>
            )}
          </Card>

          <Card className="p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Outstanding balances</h2>
                <p className="text-sm text-muted-foreground">
                  Matches Amount Due on the clients list
                </p>
              </div>
              {data.summary.balanceDue > 0 && (
                <Badge variant="outline" className="text-orange-600 border-orange-500/40">
                  {formatReportsCurrency(data.summary.balanceDue)} total
                </Badge>
              )}
            </div>

            {data.outstandingClients.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="p-3 font-medium">Client</th>
                      <th className="p-3 font-medium text-right">Amount due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.outstandingClients.map((row) => (
                      <tr key={row.clientId} className="border-t">
                        <td className="p-3">
                          <Link
                            href={`/dashboard/clients/${row.clientId}`}
                            className="font-medium hover:underline"
                          >
                            {row.clientName}
                          </Link>
                        </td>
                        <td className="p-3 text-right font-medium text-orange-600">
                          {formatReportsCurrency(row.balanceDue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center border border-dashed rounded-lg text-sm text-muted-foreground">
                No outstanding balances — you&apos;re all caught up.
              </div>
            )}
          </Card>
          </MainPageCardScroll>
        )}
      </MainPageCard>
    </div>
  )
}