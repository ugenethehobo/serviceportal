'use client'

import { useCallback, useMemo, useRef } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import type { BillingInterval, PlatformPlanId } from '@/lib/platform-billing'

interface EmbeddedPlatformCheckoutProps {
  plan: Exclude<PlatformPlanId, 'trial'>
  billingInterval?: BillingInterval
  onComplete: (sessionId: string) => void
}

export function EmbeddedPlatformCheckout({
  plan,
  billingInterval = 'month',
  onComplete,
}: EmbeddedPlatformCheckoutProps) {
  const sessionIdRef = useRef<string | null>(null)
  const stripePromise = useMemo(
    () => loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!),
    []
  )

  const fetchClientSecret = useCallback(async () => {
    const response = await fetch('/api/stripe/billing/signup-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, billingInterval }),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || 'Could not start checkout')
    }
    sessionIdRef.current = data.sessionId as string
    return data.clientSecret as string
  }, [plan, billingInterval])

  return (
    <div className="min-h-[480px] overflow-hidden rounded-xl border bg-card">
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{
          fetchClientSecret,
          onComplete: () => {
            const sessionId =
              sessionIdRef.current || new URLSearchParams(window.location.search).get('session_id')
            if (sessionId) onComplete(sessionId)
          },
        }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  )
}