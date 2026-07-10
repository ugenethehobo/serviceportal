'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'
import type { OnboardingStepHandle } from '@/components/dashboard/onboarding/onboarding-profile-step'
import { StripeConnectEmbeddedOnboarding } from '@/components/dashboard/stripe-connect-embedded-onboarding'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageLoadingSkeleton } from '@/components/ui/page-loading-skeleton'
import type { CompanyStripeStatus } from '@/lib/stripe-connect'
import { AlertCircle, CheckCircle2, CreditCard } from 'lucide-react'

export const OnboardingPaymentsStep = forwardRef<OnboardingStepHandle, object>(
  function OnboardingPaymentsStep(_props, ref) {
    const [status, setStatus] = useState<CompanyStripeStatus | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [showOnboarding, setShowOnboarding] = useState(false)
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

    const handleOnboardingExit = useCallback(async () => {
      setShowOnboarding(false)
      await syncStatus()
    }, [syncStatus])

    useEffect(() => {
      void fetchStatus()
    }, [fetchStatus])

    useImperativeHandle(ref, () => ({
      validateAndSave: async () => true,
    }))

    if (isLoading) {
      return <PageLoadingSkeleton />
    }

    if (showOnboarding) {
      return (
        <StripeConnectEmbeddedOnboarding
          onExit={() => void handleOnboardingExit()}
          onComplete={() => void handleOnboardingExit()}
        />
      )
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
                <Button type="button" onClick={() => setShowOnboarding(true)}>
                  {isPending ? 'Complete Stripe setup' : 'Connect with Stripe'}
                </Button>
              ) : null}
              {status?.stripeAccountId ? (
                <Button type="button" variant="outline" onClick={() => void syncStatus()}>
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