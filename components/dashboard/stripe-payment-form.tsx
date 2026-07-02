'use client'

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface StripePaymentFormProps {
  clientSecret: string
  amountLabel: string
  onSuccess: (paymentIntentId: string) => void
  onCancel: () => void
}

function PaymentFormInner({
  amountLabel,
  onSuccess,
  onCancel,
}: Omit<StripePaymentFormProps, 'clientSecret'>) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsProcessing(true)

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    })

    if (error) {
      toast.error(error.message || 'Payment failed')
      setIsProcessing(false)
      return
    }

    if (paymentIntent?.status === 'succeeded') {
      toast.success('Payment successful')
      onSuccess(paymentIntent.id)
    }

    setIsProcessing(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Charging <span className="font-medium text-foreground">{amountLabel}</span>
      </p>
      <PaymentElement options={{ layout: 'tabs' }} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || isProcessing}>
          {isProcessing ? 'Processing...' : 'Pay Now'}
        </Button>
      </div>
    </form>
  )
}

export function StripePaymentForm({
  clientSecret,
  amountLabel,
  onSuccess,
  onCancel,
}: StripePaymentFormProps) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            borderRadius: '0.625rem',
          },
        },
      }}
    >
      <PaymentFormInner
        amountLabel={amountLabel}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </Elements>
  )
}