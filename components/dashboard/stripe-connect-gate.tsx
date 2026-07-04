'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { CreditCard, CheckCircle2 } from 'lucide-react'
import type { CompanyStripeStatus } from '@/lib/stripe-connect'

interface StripeConnectGateProps {
  children: React.ReactNode
}

export function StripeConnectGate({ children }: StripeConnectGateProps) {
  const [status, setStatus] = useState<CompanyStripeStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/stripe/connect/status')
        if (res.ok) {
          setStatus(await res.json())
        }
      } finally {
        setIsLoading(false)
      }
    }
    fetchStatus()
  }, [])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading billing...</div>
  }

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {!status?.billingEnabled && (
        <Card className="flex items-start gap-3 border-amber-200 bg-amber-50/80 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <CreditCard className="size-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="font-medium text-amber-900 dark:text-amber-100">
              Card payments need Stripe
            </p>
            <p className="text-amber-800/90 dark:text-amber-200/80 mt-0.5">
              {status?.stripeAccountId && !status.chargesEnabled
                ? 'Finish Stripe setup in Settings so clients can pay by card in the portal.'
                : 'Line items and cash/check payments work now. Connect Stripe in Settings when you want clients to pay online.'}
            </p>
            <Link
              href="/dashboard/settings?section=billing"
              className="inline-flex mt-2 text-sm font-medium text-amber-900 underline underline-offset-2 dark:text-amber-100"
            >
              Open billing settings
            </Link>
          </div>
        </Card>
      )}
      {children}
    </div>
  )
}

export function StripeConnectBadge({ status }: { status: CompanyStripeStatus }) {
  if (!status.billingEnabled) return null

  return (
    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
      <CheckCircle2 className="size-4" />
      Stripe connected — clients can pay online in the portal
    </div>
  )
}