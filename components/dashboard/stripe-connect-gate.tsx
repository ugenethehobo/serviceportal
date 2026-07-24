'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { CreditCard, CheckCircle2 } from 'lucide-react'
import type { CompanyStripeStatus } from '@/lib/stripe-connect'
import { cn } from '@/lib/utils'

export function useCompanyStripeStatus() {
  const [status, setStatus] = useState<CompanyStripeStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/stripe/connect/status')
        if (res.ok) {
          const data = (await res.json()) as CompanyStripeStatus
          if (!cancelled) setStatus(data)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void fetchStatus()
    return () => {
      cancelled = true
    }
  }, [])

  return { status, isLoading }
}

/** Amber banner when card payments are not fully enabled. */
export function StripeConnectAlert({ className }: { className?: string }) {
  const { status, isLoading } = useCompanyStripeStatus()

  if (isLoading || status?.billingEnabled) return null

  return (
    <Card
      className={cn(
        'flex items-start gap-3 border-amber-200 bg-amber-50/80 p-3 text-sm shadow-none dark:border-amber-900/50 dark:bg-amber-950/20',
        className
      )}
    >
      <CreditCard className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="min-w-0">
        <p className="font-medium text-amber-900 dark:text-amber-100">
          Card payments need Stripe
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/80">
          {status?.stripeAccountId && !status.chargesEnabled
            ? 'Finish Stripe setup in Settings so clients can pay by card in the portal.'
            : 'Line items and cash/check work now. Connect Stripe when you want online payments.'}
        </p>
        <Link
          href="/dashboard/settings?section=billing"
          className="mt-1.5 inline-flex text-xs font-medium text-amber-900 underline underline-offset-2 dark:text-amber-100"
        >
          Open billing settings
        </Link>
      </div>
    </Card>
  )
}

interface StripeConnectGateProps {
  children: React.ReactNode
  /** When false, only shows loading then children (alert lives inside layout). */
  showAlert?: boolean
}

function StripeConnectGateWithAlert({ children }: { children: React.ReactNode }) {
  const { isLoading } = useCompanyStripeStatus()

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading billing...</div>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <StripeConnectAlert />
      {children}
    </div>
  )
}

export function StripeConnectGate({ children, showAlert = true }: StripeConnectGateProps) {
  // When the layout owns the alert (two-column billing), skip a second status fetch.
  if (!showAlert) {
    return <div className="flex min-h-0 flex-1 flex-col">{children}</div>
  }
  return <StripeConnectGateWithAlert>{children}</StripeConnectGateWithAlert>
}

export function StripeConnectBadge({ status }: { status: CompanyStripeStatus }) {
  if (!status.billingEnabled) return null

  return (
    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
      <CheckCircle2 className="size-4" />
      Stripe connected — clients can pay online in the portal
    </div>
  )
}
