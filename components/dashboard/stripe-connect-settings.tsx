'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreditCard, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import type { CompanyStripeStatus } from '@/lib/stripe-connect'

export function StripeConnectSettings() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
      const res = await fetch('/api/stripe/connect', { method: 'POST' })
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
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    const stripeParam = searchParams.get('stripe')
    if (!stripeParam) return

    const handleReturn = async () => {
      if (stripeParam === 'return') {
        const synced = await syncStatus()
        if (synced) {
          const updated = await fetch('/api/stripe/connect/status').then((r) => r.json())
          if (updated.billingEnabled) {
            setMessage('Stripe connected successfully! Billing is now enabled.')
          } else {
            setMessage('Stripe account saved. Complete any remaining steps to enable billing.')
          }
        }
      } else if (stripeParam === 'refresh') {
        await startConnect()
        return
      }

      router.replace('/dashboard/settings')
    }

    handleReturn()
  }, [searchParams, syncStatus, startConnect, router])

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Loading billing settings...</p>
      </Card>
    )
  }

  const isConnected = status?.billingEnabled
  const isPending = status?.stripeAccountId && !status.chargesEnabled

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-muted p-3">
          <CreditCard className="size-6 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold">Billing & Payments</h2>
              {isConnected && (
                <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                  <CheckCircle2 className="size-3 mr-1" />
                  Connected
                </Badge>
              )}
              {isPending && (
                <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                  <AlertCircle className="size-3 mr-1" />
                  Setup incomplete
                </Badge>
              )}
              {!status?.stripeAccountId && (
                <Badge variant="outline" className="text-muted-foreground">
                  Not connected
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Connect your own Stripe account to enable billing. Client payments go directly to
              your Stripe account — not through ours.
            </p>
          </div>

          {isConnected && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <p className="font-medium">Billing is active</p>
              <p className="text-green-700 mt-0.5">
                You can create line items, record cash payments, and accept client payments via
                the client portal.
              </p>
            </div>
          )}

          {isPending && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">Finish setting up your Stripe account</p>
              <p className="text-amber-700 mt-0.5">
                Your account is linked but Stripe still needs a few details before you can accept
                payments. Billing stays disabled until setup is complete.
              </p>
            </div>
          )}

          {!status?.stripeAccountId && (
            <div className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Billing is disabled</p>
              <p className="mt-0.5">
                Connect Stripe to unlock invoicing, line items, and payment tracking on jobs.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {!isConnected && (
              <Button onClick={startConnect} disabled={isConnecting}>
                <ExternalLink className="size-4 mr-2" />
                {isConnecting
                  ? 'Redirecting to Stripe...'
                  : isPending
                    ? 'Complete Stripe Setup'
                    : 'Connect with Stripe'}
              </Button>
            )}
            {status?.stripeAccountId && (
              <Button variant="outline" onClick={syncStatus} disabled={isConnecting}>
                Refresh status
              </Button>
            )}
          </div>

          {message && (
            <p className={`text-sm ${message.includes('success') || message.includes('active') ? 'text-green-600' : 'text-muted-foreground'}`}>
              {message}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}