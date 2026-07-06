'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { PortalJobPayPanel } from '@/components/portal/portal-job-pay-panel'
import { PortalScheduleHero } from '@/components/portal/portal-schedule-hero'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, type BillingLineItem, type BillingPayment } from '@/lib/billing'
import type { PortalJobCrew } from '@/lib/portal-jobs'
import { ChevronLeft } from 'lucide-react'

interface PortalJobDetailBilling {
  scheduleId: string
  title: string
  description: string | null
  startTime: string
  endTime: string
  status: string
  listPrice: number
  lineItems: BillingLineItem[]
  payments: BillingPayment[]
  summary: {
    totalCharged: number
    totalPaid: number
    balanceDue: number
  }
  canPay: boolean
  isBillable: boolean
  crew: PortalJobCrew
  serviceAddress: string
}

interface PortalJobDetailProps {
  jobId: string
  clientId: string
  billing: PortalJobDetailBilling
  timezone: string
}

export function PortalJobDetail({ jobId, clientId, billing, timezone }: PortalJobDetailProps) {
  const searchParams = useSearchParams()
  const autoPay = searchParams.get('pay') === '1'
  const showPaymentFirst = autoPay || billing.canPay

  return (
    <div
      className={`flex flex-col gap-5 sm:gap-6 h-full min-h-0 ${
        showPaymentFirst ? 'max-md:pb-[calc(5rem+env(safe-area-inset-bottom))]' : ''
      }`}
    >
      <Link
        href="/portal/jobs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
      >
        <ChevronLeft className="size-4" />
        All jobs
      </Link>

      <PortalScheduleHero
        job={{
          id: jobId,
          title: billing.title,
          status: billing.status,
          startTime: billing.startTime,
          endTime: billing.endTime,
          crew: billing.crew,
          serviceAddress: billing.serviceAddress,
          canPay: billing.canPay,
          balanceDueFormatted: formatCurrency(billing.summary.balanceDue),
        }}
        timezone={timezone}
        showPayButton={!showPaymentFirst}
      />

      {showPaymentFirst && (
        <>
          <div className="hidden md:block">
            <PortalJobPayPanel
              scheduleId={jobId}
              clientId={clientId}
              balanceDue={billing.summary.balanceDue}
              totalCharged={billing.summary.totalCharged}
              lineItemCount={billing.lineItems.length}
              autoStart={autoPay}
            />
          </div>
          <PortalJobPayPanel
            scheduleId={jobId}
            clientId={clientId}
            balanceDue={billing.summary.balanceDue}
            totalCharged={billing.summary.totalCharged}
            lineItemCount={billing.lineItems.length}
            autoStart={autoPay}
            compact
          />
        </>
      )}

      {billing.description?.trim() && (
        <Card className="shadow-sm p-5">
          <h2 className="font-semibold">About this visit</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed whitespace-pre-wrap">
            {billing.description}
          </p>
        </Card>
      )}

      {billing.lineItems.length > 0 && (
        <Card className="shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-muted/20">
            <h2 className="font-semibold">Charges</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              What you&apos;re being billed for on this job
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5">Description</TableHead>
                <TableHead className="px-5 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {billing.lineItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="px-5">
                    <p className="font-medium">{item.description}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      {item.quantity} × {formatCurrency(item.unit_price)}
                    </p>
                  </TableCell>
                  <TableCell className="px-5 text-right font-medium">
                    {formatCurrency(item.amount)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/10 hover:bg-muted/10">
                <TableCell className="px-5 font-medium">Total</TableCell>
                <TableCell className="px-5 text-right font-semibold">
                  {formatCurrency(billing.summary.totalCharged)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Charged</p>
          <p className="text-xl font-semibold mt-1">{formatCurrency(billing.summary.totalCharged)}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid</p>
          <p className="text-xl font-semibold mt-1 text-green-600">
            {formatCurrency(billing.summary.totalPaid)}
          </p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Balance</p>
          <p
            className={`text-xl font-semibold mt-1 ${
              billing.summary.balanceDue > 0 ? 'text-orange-600' : ''
            }`}
          >
            {formatCurrency(billing.summary.balanceDue)}
          </p>
        </Card>
      </div>

      {billing.payments.length > 0 && (
        <Card className="shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold">Payment history</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5">Method</TableHead>
                <TableHead className="px-5">Date</TableHead>
                <TableHead className="px-5 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {billing.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="px-5 font-medium capitalize">{payment.method}</TableCell>
                  <TableCell className="px-5 text-muted-foreground">
                    {new Date(payment.payment_date + 'T00:00:00').toLocaleDateString()}
                  </TableCell>
                  <TableCell className="px-5 text-right font-medium text-green-700">
                    {formatCurrency(payment.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

    </div>
  )
}