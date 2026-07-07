'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'
import type { OnboardingStepHandle } from '@/components/dashboard/onboarding/onboarding-profile-step'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CompanyStripeStatus } from '@/lib/stripe-connect'
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink } from 'lucide-react'

export const OnboardingPaymentsStep = forwardRef<OnboardingStepHandle, object>(
  function OnboardingPaymentsStep(_props, ref) {
    const [status, setStatus] = useState<CompanyStripeStatus | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isConnecting, setIsConnecting] = useState(false)
    const [message, setMessage] = useState('')

    const fetchStatus = useCallback(async () => {
      try {
        const res = await fetch('/api/stripe/connect/status')
        if (res.ok) {
          setStatus(await res.json())
        }
      } finally {
        setIsLoading(false)
      }
    }, [])

    const syncStatus = useCallback(async () => {
      const res = await fetch('/api/stripe/connect/refresh', { method: 'POST' })
      if (res.ok) {
        setStatus(await res.json())
        return true
      }
      return false
    }, [])

    const startConnect = useCallback(async () => {
      setIsConnecting(true)
      setMessage('')
      try {
        const res = await fetch('/api/stripe/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnTo: 'onboarding' }),
        })
        const data = await res.json()
        if (res.ok && data.url) {
          window.location.href = data.url
          return
        }
        setMessage(data.error || 'Failed to start Stripe Connect')
      } catch {
        setMessage('Failed to start Stripe Connect')
      } finally {
        setIsConnecting(false)
      }
    }, [])

    useEffect(() => {
      void fetchStatus()
    }, [fetchStatus])

    useImperativeHandle(ref, () => ({
      validateAndSave: async () => true,
    }))

    if (isLoading) {
      return <p className="text-sm text-muted-foreground">Loading payment settings…</p>
    }

    const isConnected = status?.billingEnabled
    const isPending = status?.stripeAccountId && !status.chargesEnabled

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-muted p-3 shrink-0">
            <CreditCard className="size-6 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {isConnected ? (
                <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                  <CheckCircle2 className="size-3 mr-1" />
                  Connected
                </Badge>
              ) : null}
              {isPending ? (
                <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                  <AlertCircle className="size-3 mr-1" />
                  Setup incomplete
                </Badge>
              ) : null}
              {!status?.stripeAccountId ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Not connected
                </Badge>
              ) : null}
            </div>

            <p className="text-sm text-muted-foreground">
              Connect your own Stripe account to accept client payments. Funds go directly to you —
              not through ServicePortal. You can skip this step and connect later in Settings.
            </p>

            {isConnected ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <p className="font-medium">Billing is active</p>
                <p className="text-green-700 mt-0.5">
                  You can invoice clients and accept payments through the portal.
                </p>
              </div>
            ) : null}

            {isPending ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">Finish setting up your Stripe account</p>
                <p className="text-amber-700 mt-0.5">
                  Stripe still needs a few details before you can accept payments.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {!isConnected ? (
                <Button type="button" onClick={() => void startConnect()} disabled={isConnecting}>
                  <ExternalLink className="size-4 mr-2" />
                  {isConnecting
                    ? 'Redirecting to Stripe…'
                    : isPending
                      ? 'Complete Stripe setup'
                      : 'Connect with Stripe'}
                </Button>
              ) : null}
              {status?.stripeAccountId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void syncStatus()}
                  disabled={isConnecting}
                >
                  Refresh status
                </Button>
              ) : null}
            </div>

            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          </div>
        </div>
      </div>
    )
  }
)