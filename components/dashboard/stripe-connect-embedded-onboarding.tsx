'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadConnectAndInitialize } from '@stripe/connect-js'
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from '@stripe/react-connect-js'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageLoadingSkeleton } from '@/components/ui/page-loading-skeleton'
import {
  getStripeConnectAppearance,
  STRIPE_CONNECT_FONTS,
} from '@/lib/stripe-connect-appearance'
import { ExternalLink, Info } from 'lucide-react'

type StripeConnectEmbeddedOnboardingProps = {
  onExit: () => void
  onComplete?: () => void
}

export function StripeConnectEmbeddedOnboarding({
  onExit,
  onComplete,
}: StripeConnectEmbeddedOnboardingProps) {
  const { resolvedTheme } = useTheme()
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [currentStep, setCurrentStep] = useState<string | null>(null)

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch('/api/stripe/connect/account-session', { method: 'POST' })
    const data = await res.json()
    if (!res.ok || !data.clientSecret) {
      throw new Error(data.error || 'Failed to start Stripe onboarding')
    }
    return data.clientSecret as string
  }, [])

  const connectInstance = useMemo(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!publishableKey) {
      throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set')
    }

    return loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret,
      fonts: [...STRIPE_CONNECT_FONTS],
      appearance: getStripeConnectAppearance(false),
    })
  }, [fetchClientSecret])

  useEffect(() => {
    connectInstance.update({
      appearance: getStripeConnectAppearance(resolvedTheme === 'dark'),
    })
  }, [connectInstance, resolvedTheme])

  const showAuthHint =
    !currentStep || currentStep === 'stripe_user_authentication'

  return (
    <Card className="overflow-hidden font-sans">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">Stripe account setup</p>
          <p className="text-xs text-muted-foreground">
            Complete verification in ServicePortal. Stripe may open a one-time sign-in
            window for security.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onExit}>
          Close
        </Button>
      </div>

      {showAuthHint && isReady ? (
        <div className="flex items-start gap-2 border-b bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Stripe requires a quick sign-in popup for Express accounts. After that,
            business details, identity verification, and payout setup continue inline
            below.
            <ExternalLink className="ml-1 inline size-3 opacity-70" />
          </p>
        </div>
      ) : null}

      {!isReady && (
        <div className="p-6">
          <PageLoadingSkeleton />
        </div>
      )}

      <div
        className={
          isReady
            ? 'min-h-[28rem] p-2 font-sans sm:p-4'
            : 'sr-only min-h-[28rem] font-sans'
        }
      >
        <ConnectComponentsProvider connectInstance={connectInstance}>
          <ConnectAccountOnboarding
            collectionOptions={{
              fields: 'eventually_due',
              futureRequirements: 'include',
            }}
            onLoaderStart={() => setIsReady(true)}
            onLoadError={(event) => {
              setLoadError(event.error?.message || 'Failed to load Stripe onboarding')
              setIsReady(true)
            }}
            onStepChange={({ step }) => setCurrentStep(step)}
            onExit={() => {
              onComplete?.()
              onExit()
            }}
          />
        </ConnectComponentsProvider>
      </div>

      {loadError ? (
        <p className="border-t px-4 py-3 text-sm text-destructive">{loadError}</p>
      ) : null}
    </Card>
  )
}