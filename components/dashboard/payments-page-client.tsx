'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getCompanyPaymentsAction } from '@/app/action'
import type { PaymentsFilterSource } from '@/lib/billing-queries'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { MainPageCard, MainPageCardScroll } from '@/components/ui/main-page-card'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoadingSkeleton } from '@/components/ui/page-loading-skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, type CompanyPaymentRow } from '@/lib/billing'
import { MobileListCard, MobileListCardRow } from '@/components/ui/mobile-list-card'
import {
  MOBILE_LIST_STACK_CLASS,
  MOBILE_PAGE_ROOT_CLASS,
  MOBILE_SELECT_TRIGGER_CLASS,
  MOBILE_TABLE_DESKTOP_ONLY_CLASS,
} from '@/lib/mobile-layout'
import { REPORTS_PERIOD_LABELS, type ReportsPeriod } from '@/lib/reports'
import { Button } from '@/components/ui/button'
import { CreditCard, ExternalLink, Search } from 'lucide-react'

const SOURCE_LABELS: Record<PaymentsFilterSource, string> = {
  all: 'All sources',
  stripe: 'Client portal (Stripe)',
  manual: 'Cash & check',
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card className="p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight mt-1">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </Card>
  )
}

function PaymentSourceBadge({ payment }: { payment: CompanyPaymentRow }) {
  if (payment.source === 'stripe') {
    return <Badge variant="secondary">Client portal</Badge>
  }
  return <Badge variant="outline" className="capitalize">{payment.method}</Badge>
}

type PaymentsPageInitialData = {
  payments: CompanyPaymentRow[]
  summary: {
    totalCollected: number
    stripeTotal: number
    manualTotal: number
    paymentCount: number
  }
  periodLabel: string
  pagination: {
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  }
}

export function PaymentsPageClient({
  initialData,
  initialPeriod = '30d',
}: {
  initialData: PaymentsPageInitialData
  initialPeriod?: ReportsPeriod
}) {
  const [period, setPeriod] = useState<ReportsPeriod>(initialPeriod)
  const [source, setSource] = useState<PaymentsFilterSource>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [payments, setPayments] = useState<CompanyPaymentRow[]>(initialData.payments)
  const [summary, setSummary] = useState(initialData.summary)
  const [periodLabel, setPeriodLabel] = useState(initialData.periodLabel)
  const [pagination, setPagination] = useState(initialData.pagination)
  const [page, setPage] = useState(initialData.pagination.page)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const fetchPayments = useCallback(async () => {
    setIsLoading(true)
    const result = await getCompanyPaymentsAction({
      period,
      source,
      search: debouncedSearch,
      page,
    })

    if (result.success) {
      setPayments(result.payments)
      setSummary(result.summary)
      setPeriodLabel(result.periodLabel)
      setPagination(result.pagination)
      setError(null)
    } else {
      setPayments([])
      setError(result.error)
    }

    setIsLoading(false)
  }, [period, source, debouncedSearch, page])

  useEffect(() => {
    setPage(1)
  }, [period, source, debouncedSearch])

  useEffect(() => {
    if (
      page === 1 &&
      period === initialPeriod &&
      source === 'all' &&
      debouncedSearch === ''
    ) {
      return
    }
    void fetchPayments()
  }, [fetchPayments, page, period, initialPeriod, source, debouncedSearch])

  return (
    <div className={MOBILE_PAGE_ROOT_CLASS}>
      <PageHeader
        title="Payments"
        description="Every transaction across your company — portal card payments and in-person cash/check"
        actions={
          <>
            <Select
              value={source}
              onValueChange={(value) => setSource((value ?? 'all') as PaymentsFilterSource)}
            >
              <SelectTrigger className={`w-[200px] ${MOBILE_SELECT_TRIGGER_CLASS}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_LABELS) as PaymentsFilterSource[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SOURCE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={period}
              onValueChange={(value) => setPeriod((value ?? '30d') as ReportsPeriod)}
            >
              <SelectTrigger className={`w-[180px] ${MOBILE_SELECT_TRIGGER_CLASS}`}>
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
          </>
        }
      />

      <MainPageCard className="p-4 sm:p-6">
        {error ? (
          <EmptyState
            title="Could not load payments"
            description={error}
            onRetry={() => void fetchPayments()}
          />
        ) : isLoading ? (
          <div className="space-y-6">
            <PageLoadingSkeleton variant="cards" className="sm:grid-cols-3 xl:grid-cols-3" />
            <PageLoadingSkeleton variant="table" />
          </div>
        ) : (
          <MainPageCardScroll contentClassName="flex flex-col gap-6 pr-2">
              <div className="relative max-w-md">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search client, job, method..."
                  className="pl-9"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCard
                  label="Collected"
                  value={formatCurrency(summary.totalCollected)}
                  hint={`${summary.paymentCount} payments · ${periodLabel}`}
                />
                <SummaryCard
                  label="Client portal"
                  value={formatCurrency(summary.stripeTotal)}
                  hint="Stripe card payments"
                />
                <SummaryCard
                  label="Cash & check"
                  value={formatCurrency(summary.manualTotal)}
                  hint="Recorded in the dashboard"
                />
              </div>

              {payments.length > 0 ? (
                <>
                <div className={`rounded-lg border overflow-hidden ${MOBILE_TABLE_DESKTOP_ONLY_CLASS}`}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Job</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="w-28" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(payment.paymentDate + 'T00:00:00').toLocaleDateString()}
                          </TableCell>
                          <TableCell className="font-medium">{payment.clientName}</TableCell>
                          <TableCell className="max-w-[220px] truncate">{payment.jobTitle}</TableCell>
                          <TableCell>
                            <PaymentSourceBadge payment={payment} />
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-700">
                            {formatCurrency(payment.amount)}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/dashboard/clients/${payment.clientId}/jobs/${payment.scheduleId}?tab=billing`}
                              className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                            >
                              View
                              <ExternalLink className="size-3.5" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className={MOBILE_LIST_STACK_CLASS}>
                  {payments.map((payment) => (
                    <MobileListCard key={payment.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{payment.clientName}</p>
                          <p className="text-sm text-muted-foreground truncate">{payment.jobTitle}</p>
                        </div>
                        <p className="shrink-0 font-semibold text-green-700">
                          {formatCurrency(payment.amount)}
                        </p>
                      </div>
                      <div className="mt-3 space-y-2">
                        <MobileListCardRow
                          label="Date"
                          value={new Date(payment.paymentDate + 'T00:00:00').toLocaleDateString()}
                        />
                        <MobileListCardRow label="Source" value={<PaymentSourceBadge payment={payment} />} />
                      </div>
                      <div className="mt-3">
                        <Link
                          href={`/dashboard/clients/${payment.clientId}/jobs/${payment.scheduleId}?tab=billing`}
                          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium hover:underline"
                        >
                          View job billing
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </div>
                    </MobileListCard>
                  ))}
                </div>
                </>
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title="No payments found"
                  description="No payments match this period and filter."
                />
              )}

              {pagination.total > 0 ? (
                <div className="flex items-center justify-between gap-3 border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} · {pagination.total} payments
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isLoading || pagination.page <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isLoading || !pagination.hasMore}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
          </MainPageCardScroll>
        )}
      </MainPageCard>
    </div>
  )
}