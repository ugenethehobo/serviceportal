'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getCompanyPaymentsAction, type PaymentsFilterSource } from '@/app/action'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, type CompanyPaymentRow } from '@/lib/billing'
import { REPORTS_PERIOD_LABELS, type ReportsPeriod } from '@/lib/reports'
import { ExternalLink, Search } from 'lucide-react'

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

export function PaymentsPageClient() {
  const [period, setPeriod] = useState<ReportsPeriod>('30d')
  const [source, setSource] = useState<PaymentsFilterSource>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [payments, setPayments] = useState<CompanyPaymentRow[]>([])
  const [summary, setSummary] = useState({
    totalCollected: 0,
    stripeTotal: 0,
    manualTotal: 0,
    paymentCount: 0,
  })
  const [periodLabel, setPeriodLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
    })

    if (result.success) {
      setPayments(result.payments)
      setSummary(result.summary)
      setPeriodLabel(result.periodLabel)
      setError(null)
    } else {
      setPayments([])
      setError(result.error)
    }

    setIsLoading(false)
  }, [period, source, debouncedSearch])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  return (
    <div className="p-6 flex flex-col gap-6 min-h-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Every transaction across your company — portal card payments and in-person cash/check
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={source} onValueChange={(value) => setSource((value ?? 'all') as PaymentsFilterSource)}>
            <SelectTrigger className="w-[200px]">
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

          <Select value={period} onValueChange={(value) => setPeriod((value ?? '30d') as ReportsPeriod)}>
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
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client, job, method..."
          className="pl-9"
        />
      </div>

      {error ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
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

          <Card className="shadow-sm overflow-hidden">
            {payments.length > 0 ? (
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
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No payments match this period and filter.
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}