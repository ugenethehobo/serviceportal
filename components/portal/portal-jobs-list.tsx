'use client'

import { useRouter } from 'next/navigation'
import { JobStatusBadge } from '@/components/dashboard/job-status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatCurrency } from '@/lib/billing'
import { Calendar, ChevronRight, CreditCard } from 'lucide-react'

export type PortalJobListItem = {
  id: string
  title: string
  start_time: string
  end_time: string
  status: string
  price: number
  balanceDue: number
  balanceDueFormatted: string
  canPay: boolean
  isPaid: boolean
}

function formatJobDate(startTime: string) {
  return new Date(startTime).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function JobRow({ job }: { job: PortalJobListItem }) {
  const router = useRouter()

  const openJob = () => router.push(`/portal/jobs/${job.id}`)
  const openPayment = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(`/portal/jobs/${job.id}?pay=1`)
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={openJob}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openJob()
        }
      }}
      className="p-4 shadow-sm cursor-pointer transition-colors hover:bg-muted/40 hover:border-primary/30 group"
    >
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-base group-hover:text-primary transition-colors">
              {job.title}
            </h3>
            <JobStatusBadge status={job.status} />
          </div>

          <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1.5">
            <Calendar className="size-3.5 shrink-0" />
            {formatJobDate(job.start_time)}
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
            {job.canPay && (
              <span className="font-medium text-orange-600">
                {job.balanceDueFormatted} due
              </span>
            )}
            {job.isPaid && (
              <span className="font-medium text-green-700">Paid in full</span>
            )}
            {!job.canPay && !job.isPaid && job.price > 0 && (
              <span className="text-muted-foreground">
                Quoted {formatCurrency(job.price)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          {job.canPay && (
            <Button
              size="sm"
              onClick={openPayment}
              className="gap-1.5"
            >
              <CreditCard className="size-4" />
              Pay {job.balanceDueFormatted}
            </Button>
          )}
          <Button
            size="sm"
            variant={job.canPay ? 'outline' : 'default'}
            onClick={(e) => {
              e.stopPropagation()
              openJob()
            }}
            className="gap-1"
          >
            View
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function PortalJobsList({
  jobs,
  emptyMessage,
}: {
  jobs: PortalJobListItem[]
  emptyMessage: string
}) {
  if (jobs.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}
    </div>
  )
}