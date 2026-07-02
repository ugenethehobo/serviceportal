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
    return <div className="text-sm text-muted-foreground">Checking billing setup...</div>
  }

  if (!status?.billingEnabled) {
    return (
      <Card className="p-8 flex flex-col items-center justify-center text-center max-w-md mx-auto">
        <CreditCard className="size-10 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Connect Stripe to enable billing</h3>
        <p className="text-sm text-muted-foreground mb-6">
          {status?.stripeAccountId && !status.chargesEnabled
            ? 'Your Stripe account is connected but not fully set up yet. Complete onboarding in Settings.'
            : 'Each company uses their own Stripe account. Connect yours in Settings before creating invoices or accepting payments.'}
        </p>
        <Link
          href="/dashboard/settings"
          className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Go to Settings
        </Link>
      </Card>
    )
  }

  return <>{children}</>
}

export function StripeConnectBadge({ status }: { status: CompanyStripeStatus }) {
  if (!status.billingEnabled) return null

  return (
    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
      <CheckCircle2 className="size-4" />
      Stripe connected — payments go to your account
    </div>
  )
}