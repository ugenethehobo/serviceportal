'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { StripePaymentForm } from '@/components/dashboard/stripe-payment-form'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatCurrency } from '@/lib/billing'
import { toast } from 'sonner'
import { CheckCircle2, CreditCard, Lock } from 'lucide-react'

interface PortalJobPayPanelProps {
  scheduleId: string
  clientId: string
  balanceDue: number
  totalCharged: number
  lineItemCount: number
  autoStart?: boolean
  compact?: boolean
}

export function PortalJobPayPanel({
  scheduleId,
  clientId,
  balanceDue,
  totalCharged,
  lineItemCount,
  autoStart = false,
  compact = false,
}: PortalJobPayPanelProps) {
  const router = useRouter()
  const [isLoadingIntent, setIsLoadingIntent] = useState(false)
  const [paymentSession, setPaymentSession] = useState<{
    clientSecret: string
    stripeAccountId: string
    amountLabel: string
  } | null>(null)

  const canPay = balanceDue > 0 && lineItemCount > 0

  const startPayment = async () => {
    setIsLoadingIntent(true)
    try {
      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId, clientId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Unable to start payment')
        return
      }
      setPaymentSession({
        clientSecret: data.clientSecret,
        stripeAccountId: data.stripeAccountId,
        amountLabel: formatCurrency(data.amount),
      })
    } catch {
      toast.error('Unable to start payment')
    } finally {
      setIsLoadingIntent(false)
    }
  }

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    if (!paymentSession) return
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
        toast.error(data.error || 'Payment could not be recorded')
        return
      }
      toast.success('Payment successful — thank you!')
      setPaymentSession(null)
      router.replace(`/portal/jobs/${scheduleId}`)
      router.refresh()
    } catch {
      toast.error('Payment could not be recorded')
    }
  }

  useEffect(() => {
    if (autoStart && canPay && !paymentSession && !isLoadingIntent) {
      startPayment()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, canPay])

  if (!canPay && lineItemCount === 0) {
    return null
  }

  if (!canPay && lineItemCount > 0) {
    return (
      <Card className="p-4 sm:p-5 text-sm text-green-800 bg-green-50 border-green-200 shadow-sm flex items-center gap-3">
        <CheckCircle2 className="size-5 shrink-0" />
        <div>
          <p className="font-semibold">Paid in full</p>
          <p className="text-green-700/90 mt-0.5">Thank you — no balance remaining on this job.</p>
        </div>
      </Card>
    )
  }

  if (compact && !paymentSession) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
        <Button
          onClick={startPayment}
          disabled={isLoadingIntent}
          size="lg"
          className="w-full gap-2"
        >
          <CreditCard className="size-4" />
          {isLoadingIntent ? 'Preparing...' : `Pay ${formatCurrency(balanceDue)}`}
        </Button>
      </div>
    )
  }

  return (
    <Card className="shadow-sm border-border bg-card overflow-hidden" id="payment">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="rounded-xl bg-muted p-3 text-foreground shrink-0 w-fit">
            <CreditCard className="size-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Pay this job</p>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight mt-1">
              {formatCurrency(balanceDue)}
            </p>
            {totalCharged > balanceDue && (
              <p className="text-sm text-muted-foreground mt-1">
                of {formatCurrency(totalCharged)} total
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-2 inline-flex items-center gap-1.5">
              <Lock className="size-3.5" />
              Secure card payment — takes about 30 seconds
            </p>
          </div>
        </div>

        {!paymentSession ? (
          <Button
            onClick={startPayment}
            disabled={isLoadingIntent}
            className="w-full mt-5 gap-2"
            size="lg"
          >
            <CreditCard className="size-4" />
            {isLoadingIntent
              ? 'Preparing secure checkout...'
              : `Pay ${formatCurrency(balanceDue)} now`}
          </Button>
        ) : (
          <div className="mt-5 rounded-xl border bg-background p-4 sm:p-5">
            <StripePaymentForm
              clientSecret={paymentSession.clientSecret}
              amountLabel={paymentSession.amountLabel}
              stripeAccountId={paymentSession.stripeAccountId}
              onSuccess={handlePaymentSuccess}
              onCancel={() => setPaymentSession(null)}
            />
          </div>
        )}
      </div>
    </Card>
  )
}