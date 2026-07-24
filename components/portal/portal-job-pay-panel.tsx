'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { StripePaymentForm } from '@/components/dashboard/stripe-payment-form'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/billing'
import { STRIPE_MIN_USD } from '@/lib/payment-plans'
import { toast } from 'sonner'
import { CheckCircle2, CreditCard, Lock } from 'lucide-react'

export type PortalPayInstallmentChip = {
  id: string
  label: string
  remaining: number
  collectibleNow: boolean
  status: string
}

interface PortalJobPayPanelProps {
  scheduleId: string
  clientId: string
  /** Default CTA amount (collectible now). */
  amountDueNow: number
  maxPayableNow: number
  /** Ledger remaining (always truthful). */
  balanceDue: number
  totalCharged: number
  lineItemCount: number
  canPay: boolean
  lockPortalToDueNow?: boolean
  installments?: PortalPayInstallmentChip[]
  autoStart?: boolean
  compact?: boolean
}

export function PortalJobPayPanel({
  scheduleId,
  clientId,
  amountDueNow,
  maxPayableNow,
  balanceDue,
  totalCharged,
  lineItemCount,
  canPay,
  lockPortalToDueNow = false,
  installments = [],
  autoStart = false,
  compact = false,
}: PortalJobPayPanelProps) {
  const router = useRouter()
  const [isLoadingIntent, setIsLoadingIntent] = useState(false)
  const [showOtherAmount, setShowOtherAmount] = useState(false)
  const [otherAmount, setOtherAmount] = useState('')
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string | null>(null)
  const [paymentSession, setPaymentSession] = useState<{
    clientSecret: string
    stripeAccountId: string
    amountLabel: string
  } | null>(null)

  const defaultPayAmount = amountDueNow > 0 ? amountDueNow : maxPayableNow
  const chipInstallments = installments.filter(
    (i) => i.collectibleNow && i.remaining > 0 && i.status !== 'paid' && i.status !== 'superseded'
  )

  const discardSession = () => {
    setPaymentSession(null)
  }

  const startPayment = async (opts?: {
    amount?: number
    installmentId?: string | null
  }) => {
    // Discard prior session when starting again (orphan PIs OK; never reuse secret)
    discardSession()
    setIsLoadingIntent(true)
    try {
      const body: Record<string, unknown> = {
        scheduleId,
        clientId,
      }
      if (opts?.amount != null) {
        body.amount = opts.amount
      }
      if (opts?.installmentId) {
        body.installmentId = opts.installmentId
      }

      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const handlePayDefault = () => {
    void startPayment(
      selectedInstallmentId
        ? {
            amount:
              chipInstallments.find((c) => c.id === selectedInstallmentId)?.remaining ??
              defaultPayAmount,
            installmentId: selectedInstallmentId,
          }
        : undefined
    )
  }

  const handlePayOther = () => {
    const amount = Math.round(parseFloat(otherAmount) * 100) / 100
    if (!amount || amount <= 0 || isNaN(amount)) {
      toast.error('Enter a valid amount')
      return
    }
    if (amount < STRIPE_MIN_USD) {
      toast.error(
        `Minimum card payment is ${formatCurrency(STRIPE_MIN_USD)}. Pay remaining balances under that with cash or check.`
      )
      return
    }
    if (amount > maxPayableNow + 0.009) {
      toast.error(`Maximum you can pay now is ${formatCurrency(maxPayableNow)}`)
      return
    }
    if (amount > balanceDue + 0.009) {
      toast.error(`Payment cannot exceed balance due (${formatCurrency(balanceDue)})`)
      return
    }
    void startPayment({ amount, installmentId: selectedInstallmentId })
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
      discardSession()
      router.replace(`/portal/jobs/${scheduleId}`)
      router.refresh()
    } catch {
      toast.error('Payment could not be recorded')
    }
  }

  useEffect(() => {
    if (autoStart && canPay && !paymentSession && !isLoadingIntent) {
      void startPayment()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, canPay])

  if (!canPay && lineItemCount === 0) {
    return null
  }

  if (!canPay && lineItemCount > 0 && balanceDue <= 0) {
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

  if (!canPay && lineItemCount > 0) {
    return (
      <Card className="p-4 sm:p-5 text-sm text-muted-foreground bg-muted/40 border shadow-sm">
        <p className="font-medium text-foreground">Payment not available yet</p>
        <p className="mt-1">
          Balance remaining: {formatCurrency(balanceDue)}. Card payment opens when your visit
          begins
          {amountDueNow > 0
            ? ` (or when a deposit is due — contact your provider if you expected to pay earlier).`
            : '.'}
        </p>
      </Card>
    )
  }

  if (compact && !paymentSession) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
        <Button
          onClick={handlePayDefault}
          disabled={isLoadingIntent}
          size="lg"
          className="w-full gap-2"
        >
          <CreditCard className="size-4" />
          {isLoadingIntent ? 'Preparing...' : `Pay ${formatCurrency(defaultPayAmount)}`}
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
              {formatCurrency(defaultPayAmount)}
            </p>
            {totalCharged > defaultPayAmount && (
              <p className="text-sm text-muted-foreground mt-1">
                of {formatCurrency(totalCharged)} total
                {balanceDue !== defaultPayAmount
                  ? ` · ${formatCurrency(balanceDue)} remaining`
                  : ''}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-2 inline-flex items-center gap-1.5">
              <Lock className="size-3.5" />
              Secure card payment — takes about 30 seconds
            </p>
          </div>
        </div>

        {chipInstallments.length > 1 && !paymentSession && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-10 max-md:flex-1 max-md:min-w-[calc(50%-0.25rem)]"
              variant={selectedInstallmentId == null ? 'default' : 'outline'}
              onClick={() => {
                discardSession()
                setSelectedInstallmentId(null)
              }}
            >
              Due now ({formatCurrency(defaultPayAmount)})
            </Button>
            {chipInstallments.map((chip) => (
              <Button
                key={chip.id}
                type="button"
                size="sm"
                className="min-h-10 max-md:flex-1 max-md:min-w-[calc(50%-0.25rem)]"
                variant={selectedInstallmentId === chip.id ? 'default' : 'outline'}
                onClick={() => {
                  discardSession()
                  setSelectedInstallmentId(chip.id)
                  setShowOtherAmount(false)
                }}
              >
                <span className="truncate">
                  {chip.label} ({formatCurrency(chip.remaining)})
                </span>
              </Button>
            ))}
          </div>
        )}

        {!paymentSession ? (
          <div className="mt-5 space-y-3">
            <Button
              onClick={handlePayDefault}
              disabled={isLoadingIntent}
              className="w-full gap-2"
              size="lg"
            >
              <CreditCard className="size-4" />
              {isLoadingIntent
                ? 'Preparing secure checkout...'
                : `Pay ${formatCurrency(
                    selectedInstallmentId
                      ? chipInstallments.find((c) => c.id === selectedInstallmentId)
                          ?.remaining ?? defaultPayAmount
                      : defaultPayAmount
                  )} now`}
            </Button>

            {!lockPortalToDueNow && maxPayableNow > defaultPayAmount + 0.009 && (
              <div className="space-y-2">
                {!showOtherAmount ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      discardSession()
                      setShowOtherAmount(true)
                      setOtherAmount(
                        String(
                          Math.min(
                            maxPayableNow,
                            Math.max(defaultPayAmount, STRIPE_MIN_USD)
                          )
                        )
                      )
                    }}
                  >
                    Pay other amount
                  </Button>
                ) : (
                  <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                    <Label className="text-xs" htmlFor="portal-other-amount">
                      Amount (max {formatCurrency(maxPayableNow)})
                    </Label>
                    <Input
                      id="portal-other-amount"
                      type="number"
                      inputMode="decimal"
                      min={STRIPE_MIN_USD}
                      max={maxPayableNow}
                      step="0.01"
                      value={otherAmount}
                      onChange={(e) => {
                        discardSession()
                        setOtherAmount(e.target.value)
                      }}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 flex-1"
                        onClick={() => {
                          setShowOtherAmount(false)
                          discardSession()
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="min-h-11 flex-1"
                        disabled={isLoadingIntent}
                        onClick={handlePayOther}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border bg-background p-4 sm:p-5">
            <StripePaymentForm
              clientSecret={paymentSession.clientSecret}
              amountLabel={paymentSession.amountLabel}
              stripeAccountId={paymentSession.stripeAccountId}
              onSuccess={handlePaymentSuccess}
              onCancel={() => discardSession()}
            />
          </div>
        )}
      </div>
    </Card>
  )
}
