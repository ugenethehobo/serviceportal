'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getPlatformFeatureUpgradeMessage, type PlatformFeature } from '@/lib/platform-entitlements'
import { getCompanySubscriptionAccessAction } from '@/app/action'
import { getPlatformPricingAction } from '@/app/signup/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  PLATFORM_SEAT_LIMITS,
  PLATFORM_TRIAL_DAYS,
  getSubscriptionDisplayLabel,
  type PlatformPlanId,
  type PlatformSubscriptionStatus,
} from '@/lib/platform-billing'
import { formatPlanPriceLine, pricingByPlanId } from '@/lib/platform-pricing'
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
  const searchParams = useSearchParams()
  const trialRedirect = searchParams.get('trial') === 'expired'
  const upgradeFeature = searchParams.get('upgrade') as PlatformFeature | null
  const upgradeMessage =
    upgradeFeature === 'routes' ||
    upgradeFeature === 'reports' ||
    upgradeFeature === 'integrations'
      ? getPlatformFeatureUpgradeMessage(upgradeFeature)
      : null
  const [loadingPlan, setLoadingPlan] = useState<PlatformPlanId | 'portal' | null>(null)
  const [pricingLoaded, setPricingLoaded] = useState(false)
  const [pricingMap, setPricingMap] = useState(
    pricingByPlanId([])
  )
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)
  const [trialExpired, setTrialExpired] = useState(false)

  useEffect(() => {
    void (async () => {
      const [pricingResult, accessResult] = await Promise.all([
        getPlatformPricingAction(),
        getCompanySubscriptionAccessAction(),
      ])
      if (pricingResult.success) {
        setPricingMap(pricingByPlanId(pricingResult.plans))
      }
      if (accessResult.success) {
        setDaysRemaining(accessResult.access.daysRemaining)
        setTrialEndsAt(accessResult.access.trialEndsAt)
        setTrialExpired(accessResult.access.isTrialExpired)
      }
      setPricingLoaded(true)
    })()
  }, [])

  const displayLabel = getSubscriptionDisplayLabel(plan, status, null)

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

  const paidPlans = useMemo(() => (['basic', 'pro'] as const), [])

  return (
    <div className="space-y-5">
      {upgradeMessage && (
        <Card className="border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">Upgrade required</p>
          <p className="mt-1 text-sm text-muted-foreground">{upgradeMessage}</p>
        </Card>
      )}

      {(trialExpired || trialRedirect) && (
        <Card className="border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium">Your free trial has ended</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a paid plan below to restore dashboard access for your team and client portal.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            status === 'active'
              ? 'default'
              : trialExpired || status === 'trial_expired'
                ? 'destructive'
                : 'outline'
          }
        >
          {displayLabel}
        </Badge>
        {plan === 'trial' && !trialExpired && daysRemaining != null && (
          <Badge variant={daysRemaining <= 3 ? 'destructive' : 'secondary'}>
            {daysRemaining === 1 ? '1 day remaining' : `${daysRemaining} days remaining`}
          </Badge>
        )}
        {status === 'past_due' && (
          <Badge variant="destructive">Payment past due</Badge>
        )}
      </div>

      {plan === 'trial' && !trialExpired && (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            You&apos;re on the {PLATFORM_TRIAL_DAYS}-day free trial with full platform access.
            {trialEndsAt && (
              <>
                {' '}
                Your trial ends on{' '}
                <strong>
                  {new Date(trialEndsAt).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </strong>
                .
              </>
            )}
          </p>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        Your plan includes <strong>{PLATFORM_SEAT_LIMITS[plan]} team seats</strong>
        {plan === 'trial' && ', 2 crews'}
        {plan === 'basic' && ', 5 crews, and reports'}
        {plan === 'pro' && ', unlimited crews, routes, reports, and integrations'}
        . Plan prices are loaded from Stripe.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {paidPlans.map((planId) => {
          const info = pricingMap[planId]
          const isCurrent = plan === planId && (status === 'active' || status === 'past_due')
          return (
            <Card key={planId} className="p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{info.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{info.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {info.seatLimit} seats included
                  </p>
                </div>
                <p className="text-lg font-semibold shrink-0">
                  {pricingLoaded ? formatPlanPriceLine(info) : '…'}
                </p>
              </div>
              <Button
                className="mt-4 w-full"
                variant={isCurrent ? 'secondary' : 'default'}
                disabled={isCurrent || loadingPlan !== null || !pricingLoaded}
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