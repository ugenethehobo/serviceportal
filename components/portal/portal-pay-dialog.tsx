'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { StripePaymentForm } from '@/components/dashboard/stripe-payment-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/billing'
import {
  MOBILE_FULL_WIDTH_BUTTON_CLASS,
  SCROLLABLE_MODAL_BODY_CLASS,
  SCROLLABLE_MODAL_HEADER_CLASS,
  SCROLLABLE_MODAL_SHELL_MD,
} from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'
import type { PortalPayableJob } from '@/lib/portal-jobs'
import { ArrowLeft, CreditCard, Lock } from 'lucide-react'
import { toast } from 'sonner'

type PortalPayDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  payableJobs: PortalPayableJob[]
  totalFormatted: string
}

export function PortalPayDialog({
  open,
  onOpenChange,
  clientId,
  payableJobs,
  totalFormatted,
}: PortalPayDialogProps) {
  const router = useRouter()
  const [jobs, setJobs] = useState(payableJobs)
  const [payingJob, setPayingJob] = useState<PortalPayableJob | null>(null)
  const [isLoadingIntent, setIsLoadingIntent] = useState(false)
  const [paymentSession, setPaymentSession] = useState<{
    clientSecret: string
    stripeAccountId: string
    amountLabel: string
  } | null>(null)

  useEffect(() => {
    setJobs(payableJobs)
  }, [payableJobs])

  useEffect(() => {
    if (!open) {
      setPayingJob(null)
      setPaymentSession(null)
      setIsLoadingIntent(false)
    }
  }, [open])

  const startPayment = async (job: PortalPayableJob) => {
    setPayingJob(job)
    setPaymentSession(null)
    setIsLoadingIntent(true)
    try {
      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId: job.id, clientId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Unable to start payment')
        setPayingJob(null)
        return
      }
      setPaymentSession({
        clientSecret: data.clientSecret,
        stripeAccountId: data.stripeAccountId,
        amountLabel: formatCurrency(data.amount),
      })
    } catch {
      toast.error('Unable to start payment')
      setPayingJob(null)
    } finally {
      setIsLoadingIntent(false)
    }
  }

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!paymentSession || !payingJob) return
    const paidJobId = payingJob.id
    try {
      const res = await fetch('/api/stripe/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId,
          stripeAccountId: paymentSession.stripeAccountId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(
          data.code === 'LEDGER_OVERPAYMENT'
            ? data.error ||
                'This payment could not be recorded because it would exceed the job balance. Contact the business for a refund if you were charged.'
            : data.error || 'Payment could not be recorded',
          data.code === 'LEDGER_OVERPAYMENT' ? { duration: 8000 } : undefined
        )
        return
      }
      toast.success('Payment successful — thank you!')
      setPaymentSession(null)
      setPayingJob(null)
      const remaining = jobs.filter((j) => j.id !== paidJobId)
      setJobs(remaining)
      router.refresh()
      if (remaining.length === 0) {
        onOpenChange(false)
      }
    } catch {
      toast.error('Payment could not be recorded')
    }
  }

  const backToList = () => {
    setPayingJob(null)
    setPaymentSession(null)
    setIsLoadingIntent(false)
  }

  const showPaymentStep = payingJob !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={SCROLLABLE_MODAL_SHELL_MD} showCloseButton>
        {showPaymentStep ? (
          <>
            <DialogHeader
              className={cn('border-b px-6 pt-5 pb-4', SCROLLABLE_MODAL_HEADER_CLASS)}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={backToList}
                className="-ml-2 mb-1 h-auto w-fit gap-1.5 px-2 text-muted-foreground"
              >
                <ArrowLeft className="size-3.5" />
                Back to all balances
              </Button>
              <DialogTitle className="truncate">{payingJob.title}</DialogTitle>
              <DialogDescription className="sr-only">
                Pay {payingJob.balanceDueFormatted} for {payingJob.title}
              </DialogDescription>
            </DialogHeader>

            <div className={cn(SCROLLABLE_MODAL_BODY_CLASS, 'px-4 py-5 sm:px-6')}>
              <div className="space-y-4">
                <div>
                  <p className="text-3xl font-bold tracking-tight">
                    {payingJob.balanceDueFormatted}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Lock className="size-3.5" />
                    Secure card payment
                  </p>
                </div>

                {isLoadingIntent ? (
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    Preparing secure checkout...
                  </div>
                ) : paymentSession ? (
                  <div className="rounded-lg border p-4">
                    <StripePaymentForm
                      clientSecret={paymentSession.clientSecret}
                      amountLabel={paymentSession.amountLabel}
                      stripeAccountId={paymentSession.stripeAccountId}
                      onSuccess={handlePaymentSuccess}
                      onCancel={backToList}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader
              className={cn('border-b px-6 pt-5 pb-4', SCROLLABLE_MODAL_HEADER_CLASS)}
            >
              <DialogTitle>Pay your balance</DialogTitle>
              <DialogDescription>
                {jobs.length === 1
                  ? '1 visit ready to pay'
                  : `${jobs.length} visits ready to pay`}
              </DialogDescription>
            </DialogHeader>

            <div className={cn(SCROLLABLE_MODAL_BODY_CLASS, 'space-y-4 px-4 py-5 sm:px-6')}>
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <p className="text-sm text-muted-foreground">Total due</p>
                <p className="text-2xl font-bold tracking-tight">{totalFormatted}</p>
              </div>

              <ul className="space-y-2">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{job.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {job.balanceDueFormatted}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className={cn('shrink-0 gap-1.5', MOBILE_FULL_WIDTH_BUTTON_CLASS)}
                      onClick={() => void startPayment(job)}
                      disabled={isLoadingIntent}
                    >
                      <CreditCard className="size-3.5" />
                      Pay
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}