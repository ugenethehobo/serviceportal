'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PortalPageHeader } from '@/components/portal/portal-page-header'
import { PortalJobPayPanel } from '@/components/portal/portal-job-pay-panel'
import { JobStatusBadge } from '@/components/dashboard/job-status-badge'
import { formatCurrency, type JobBillingData } from '@/lib/billing'
import { ChevronLeft } from 'lucide-react'

interface PortalJobDetailProps {
  jobId: string
  clientId: string
  billing: JobBillingData
}

export function PortalJobDetail({ jobId, clientId, billing }: PortalJobDetailProps) {
  const searchParams = useSearchParams()
  const autoPay = searchParams.get('pay') === '1'

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <Link
        href="/portal/jobs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
      >
        <ChevronLeft className="size-4" />
        Back to jobs
      </Link>

      <PortalPageHeader
        title={billing.title}
        description={new Date(billing.startTime).toLocaleString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
      >
        <JobStatusBadge status={billing.status} />
      </PortalPageHeader>

      <PortalJobPayPanel
        scheduleId={jobId}
        clientId={clientId}
        billing={billing}
        autoStart={autoPay}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
        <Card className="p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total charged</p>
          <p className="text-2xl font-semibold mt-1">
            {formatCurrency(billing.summary.totalCharged)}
          </p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total paid</p>
          <p className="text-2xl font-semibold mt-1 text-green-600">
            {formatCurrency(billing.summary.totalPaid)}
          </p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Balance due</p>
          <p
            className={`text-2xl font-semibold mt-1 ${
              billing.summary.balanceDue > 0 ? 'text-orange-600' : ''
            }`}
          >
            {formatCurrency(billing.summary.balanceDue)}
          </p>
        </Card>
      </div>

      {billing.lineItems.length > 0 && (
        <Card className="shadow-sm flex flex-col min-h-0 flex-1">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold">What you&apos;re being charged for</h2>
          </div>
          <div className="divide-y">
            {billing.lineItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{item.description}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {item.quantity} × {formatCurrency(item.unit_price)}
                  </p>
                </div>
                <p className="font-medium shrink-0">{formatCurrency(item.amount)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {billing.payments.length > 0 && (
        <Card className="shadow-sm">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold">Payment history</h2>
          </div>
          <div className="divide-y">
            {billing.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
              >
                <div>
                  <p className="font-medium capitalize">{payment.method}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {new Date(payment.payment_date + 'T00:00:00').toLocaleDateString()}
                  </p>
                </div>
                <p className="font-medium text-green-700 shrink-0">
                  {formatCurrency(payment.amount)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}