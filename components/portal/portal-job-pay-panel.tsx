'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { StripePaymentForm } from '@/components/dashboard/stripe-payment-form'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatCurrency, type JobBillingData } from '@/lib/billing'
import { toast } from 'sonner'
import { CreditCard, Lock } from 'lucide-react'

interface PortalJobPayPanelProps {
  scheduleId: string
  clientId: string
  billing: JobBillingData
  autoStart?: boolean
}

export function PortalJobPayPanel({
  scheduleId,
  clientId,
  billing,
  autoStart = false,
}: PortalJobPayPanelProps) {
  const router = useRouter()
  const [isLoadingIntent, setIsLoadingIntent] = useState(false)
  const [paymentSession, setPaymentSession] = useState<{
    clientSecret: string
    stripeAccountId: string
    amountLabel: string
  } | null>(null)

  const { summary } = billing
  const canPay = summary.balanceDue > 0 && billing.lineItems.length > 0

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

  useEffect(() => {
    if (autoStart && canPay && !paymentSession && !isLoadingIntent) {
      startPayment()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, canPay])

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

  if (!canPay && billing.lineItems.length === 0) {
    return null
  }

  if (!canPay && billing.lineItems.length > 0) {
    return (
      <Card className="p-4 text-sm text-green-800 bg-green-50 border-green-200 shadow-sm">
        Paid in full — thank you!
      </Card>
    )
  }

  return (
    <Card className="p-5 shadow-sm border-orange-200 bg-orange-50/40" id="payment">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-orange-100 p-2 text-orange-700 shrink-0">
          <CreditCard className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-lg">
            Pay {formatCurrency(summary.balanceDue)}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
            <Lock className="size-3.5" />
            Secure card payment
          </p>
        </div>
      </div>

      {!paymentSession ? (
        <Button
          onClick={startPayment}
          disabled={isLoadingIntent}
          className="w-full sm:w-auto mt-4 gap-2"
          size="lg"
        >
          <CreditCard className="size-4" />
          {isLoadingIntent
            ? 'Preparing checkout...'
            : `Pay ${formatCurrency(summary.balanceDue)} now`}
        </Button>
      ) : (
        <div className="mt-4 rounded-lg border bg-background p-4">
          <StripePaymentForm
            clientSecret={paymentSession.clientSecret}
            amountLabel={paymentSession.amountLabel}
            stripeAccountId={paymentSession.stripeAccountId}
            onSuccess={handlePaymentSuccess}
            onCancel={() => setPaymentSession(null)}
          />
        </div>
      )}
    </Card>
  )
}