'use client'

import { useCallback, useMemo, useState } from 'react'
import { loadConnectAndInitialize } from '@stripe/connect-js'
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from '@stripe/react-connect-js'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageLoadingSkeleton } from '@/components/ui/page-loading-skeleton'

type StripeConnectEmbeddedOnboardingProps = {
  onExit: () => void
  onComplete?: () => void
}

export function StripeConnectEmbeddedOnboarding({
  onExit,
  onComplete,
}: StripeConnectEmbeddedOnboardingProps) {
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

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
    })
  }, [fetchClientSecret])

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">Stripe account setup</p>
          <p className="text-xs text-muted-foreground">
            Complete onboarding here without leaving ServicePortal.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onExit}>
          Close
        </Button>
      </div>

      {!isReady && (
        <div className="p-6">
          <PageLoadingSkeleton />
        </div>
      )}

      <div className={isReady ? 'p-2 sm:p-4' : 'sr-only'}>
        <ConnectComponentsProvider connectInstance={connectInstance}>
          <ConnectAccountOnboarding
            onLoaderStart={() => setIsReady(true)}
            onLoadError={(event) => {
              setLoadError(event.error?.message || 'Failed to load Stripe onboarding')
              setIsReady(true)
            }}
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