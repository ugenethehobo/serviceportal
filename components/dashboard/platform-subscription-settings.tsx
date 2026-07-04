'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  PLATFORM_PLANS,
  PLATFORM_SEAT_LIMITS,
  getSubscriptionDisplayLabel,
  type PlatformPlanId,
  type PlatformSubscriptionStatus,
} from '@/lib/platform-billing'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface PlatformSubscriptionSettingsProps {
  plan: PlatformPlanId
  status: PlatformSubscriptionStatus
  hasCustomer: boolean
}

export function PlatformSubscriptionSettings({
  plan,
  status,
  hasCustomer,
}: PlatformSubscriptionSettingsProps) {
  const [loadingPlan, setLoadingPlan] = useState<PlatformPlanId | 'portal' | null>(null)

  const startCheckout = async (targetPlan: PlatformPlanId) => {
    setLoadingPlan(targetPlan)
    try {
      const response = await fetch('/api/stripe/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Could not start checkout')
        return
      }
      if (data.url) window.location.href = data.url
    } catch {
      toast.error('Could not start checkout')
    } finally {
      setLoadingPlan(null)
    }
  }

  const openPortal = async () => {
    setLoadingPlan('portal')
    try {
      const response = await fetch('/api/stripe/billing/portal', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Could not open billing portal')
        return
      }
      if (data.url) window.location.href = data.url
    } catch {
      toast.error('Could not open billing portal')
    } finally {
      setLoadingPlan(null)
    }
  }

  const displayLabel = getSubscriptionDisplayLabel(plan, status, null)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status === 'active' ? 'default' : 'outline'}>{displayLabel}</Badge>
        {status === 'past_due' && (
          <Badge variant="destructive">Payment past due</Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Your plan includes <strong>{PLATFORM_SEAT_LIMITS[plan]} team seats</strong> (admins + team
        members).
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {(['basic', 'pro'] as const).map((planId) => {
          const info = PLATFORM_PLANS[planId]
          const isCurrent = plan === planId && (status === 'active' || status === 'past_due')
          return (
            <Card key={planId} className="p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{info.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{info.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {PLATFORM_SEAT_LIMITS[planId]} seats included
                  </p>
                </div>
                <p className="text-lg font-semibold shrink-0">
                  ${info.monthlyPrice}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
              </div>
              <Button
                className="mt-4 w-full"
                variant={isCurrent ? 'secondary' : 'default'}
                disabled={isCurrent || loadingPlan !== null}
                onClick={() => void startCheckout(planId)}
              >
                {loadingPlan === planId && <Loader2 className="size-4 animate-spin" />}
                {isCurrent ? 'Current plan' : `Choose ${info.label}`}
              </Button>
            </Card>
          )
        })}
      </div>

      {hasCustomer && (
        <Button variant="outline" onClick={() => void openPortal()} disabled={loadingPlan !== null}>
          {loadingPlan === 'portal' && <Loader2 className="size-4 animate-spin" />}
          Manage billing & invoices
        </Button>
      )}
    </div>
  )
}