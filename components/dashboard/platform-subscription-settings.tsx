'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getPlatformFeatureUpgradeMessage, type PlatformFeature } from '@/lib/platform-entitlements'
import { getCompanySubscriptionAccessAction } from '@/app/action'
import { getPlatformPricingAction } from '@/app/signup/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  PLATFORM_SEAT_LIMITS,
  PLATFORM_TRIAL_DAYS,
  getSubscriptionDisplayLabel,
  type PlatformPlanId,
  type PlatformSubscriptionStatus,
} from '@/lib/platform-billing'
import { promoAppliedLabel } from '@/lib/platform-promo'
import type { PlatformSubscriptionDetails } from '@/lib/platform-subscription-server'
import { formatPlanPriceLine, pricingByPlanId } from '@/lib/platform-pricing'
import { CalendarClock, CreditCard, Gift, Loader2, PauseCircle, PlayCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface PlatformSubscriptionSettingsProps {
  plan: PlatformPlanId
  status: PlatformSubscriptionStatus
  hasCustomer: boolean
}

type ConfirmAction = 'cancel' | 'pause' | null

function formatDisplayDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
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
  const [subscriptionAction, setSubscriptionAction] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [pricingLoaded, setPricingLoaded] = useState(false)
  const [detailsLoaded, setDetailsLoaded] = useState(false)
  const [pricingMap, setPricingMap] = useState(pricingByPlanId([]))
  const [details, setDetails] = useState<PlatformSubscriptionDetails | null>(null)
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)
  const [trialExpired, setTrialExpired] = useState(false)

  const loadDetails = useCallback(async () => {
    const response = await fetch('/api/stripe/billing/subscription')
    const data = await response.json()
    if (response.ok && data.details) {
      setDetails(data.details)
    }
    setDetailsLoaded(true)
  }, [])

  useEffect(() => {
    void (async () => {
      const [pricingResult, accessResult] = await Promise.all([
        getPlatformPricingAction(),
        getCompanySubscriptionAccessAction(),
        loadDetails(),
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
  }, [loadDetails])

  const resolvedPlan = details?.plan ?? plan
  const resolvedStatus = details?.status ?? status
  const promoApplied = details?.promoApplied ?? false
  const displayLabel = getSubscriptionDisplayLabel(
    resolvedPlan,
    resolvedStatus,
    promoApplied ? 'promo' : null
  )

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

  const runSubscriptionAction = async (action: 'cancel' | 'resume' | 'pause' | 'unpause') => {
    setSubscriptionAction(action)
    try {
      const response = await fetch('/api/stripe/billing/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Could not update subscription')
        return
      }
      setDetails(data.details)
      if (action === 'cancel') {
        toast.success('Subscription will cancel at the end of the current billing period')
      } else if (action === 'pause') {
        toast.success('Billing paused')
      } else if (action === 'resume' || action === 'unpause') {
        toast.success('Subscription resumed')
      }
    } catch {
      toast.error('Could not update subscription')
    } finally {
      setSubscriptionAction(null)
      setConfirmAction(null)
    }
  }

  const paidPlans = useMemo(() => (['basic', 'pro'] as const), [])
  const renewalDate = formatDisplayDate(details?.currentPeriodEnd)
  const isStripeBilling = details?.billingSource === 'stripe'
  const showPlanPicker = !promoApplied && (resolvedPlan === 'trial' || trialExpired || !isStripeBilling)

  return (
    <div className="space-y-5">
      {upgradeMessage && (
        <Card className="border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">Upgrade required</p>
          <p className="mt-1 text-sm text-muted-foreground">{upgradeMessage}</p>
        </Card>
      )}

      {(trialExpired || trialRedirect) && !promoApplied && (
        <Card className="border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium">Your free trial has ended</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a paid plan below to restore dashboard access for your team and client portal.
          </p>
        </Card>
      )}

      <Card className="p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-lg">{details?.planLabel ?? displayLabel}</h3>
              <Badge
                variant={
                  promoApplied
                    ? 'secondary'
                    : resolvedStatus === 'active' && !details?.cancelAtPeriodEnd && !details?.isPaused
                      ? 'default'
                      : trialExpired || resolvedStatus === 'trial_expired'
                        ? 'destructive'
                        : 'outline'
                }
              >
                {details?.statusLabel ?? displayLabel}
              </Badge>
              {resolvedPlan === 'trial' && !trialExpired && daysRemaining != null && (
                <Badge variant={daysRemaining <= 3 ? 'destructive' : 'secondary'}>
                  {daysRemaining === 1 ? '1 day remaining' : `${daysRemaining} days remaining`}
                </Badge>
              )}
              {resolvedStatus === 'past_due' && (
                <Badge variant="destructive">Payment past due</Badge>
              )}
            </div>

            {promoApplied ? (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Gift className="size-4 shrink-0 mt-0.5 text-primary" />
                <p>
                  {promoAppliedLabel()} on the <strong>{details?.planLabel}</strong> plan.
                  {details?.promoCodeMasked ? (
                    <>
                      {' '}
                      Code: <span className="font-mono">{details.promoCodeMasked}</span>
                    </>
                  ) : null}{' '}
                  This account is not billed through Stripe.
                </p>
              </div>
            ) : isStripeBilling ? (
              <div className="space-y-1 text-sm text-muted-foreground">
                {details?.priceLabel && (
                  <p className="flex items-center gap-2">
                    <CreditCard className="size-4 shrink-0" />
                    <span>{details.priceLabel}</span>
                  </p>
                )}
                {renewalDate && (
                  <p className="flex items-center gap-2">
                    <CalendarClock className="size-4 shrink-0" />
                    <span>
                      {details?.cancelAtPeriodEnd
                        ? `Access ends on ${renewalDate}`
                        : details?.isPaused
                          ? `Billing paused — service continues through ${renewalDate}`
                          : `Renews on ${renewalDate}`}
                    </span>
                  </p>
                )}
                {details?.pauseResumesAt && (
                  <p className="text-xs">Auto-resume billing: {formatDisplayDate(details.pauseResumesAt)}</p>
                )}
              </div>
            ) : resolvedPlan === 'trial' && !trialExpired ? (
              <p className="text-sm text-muted-foreground">
                You&apos;re on the {PLATFORM_TRIAL_DAYS}-day free trial.
                {trialEndsAt && (
                  <>
                    {' '}
                    Trial ends on <strong>{formatDisplayDate(trialEndsAt)}</strong>.
                  </>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Subscribe to a paid plan to unlock ongoing platform access.
              </p>
            )}
          </div>
        </div>

        {!promoApplied && isStripeBilling && details && (
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
            {details.cancelAtPeriodEnd && details.canResume && (
              <Button
                variant="outline"
                size="sm"
                disabled={subscriptionAction !== null}
                onClick={() => void runSubscriptionAction('resume')}
              >
                {subscriptionAction === 'resume' && <Loader2 className="size-4 animate-spin" />}
                <PlayCircle className="size-4" />
                Keep subscription
              </Button>
            )}
            {details.canPause && (
              <Button
                variant="outline"
                size="sm"
                disabled={subscriptionAction !== null}
                onClick={() => setConfirmAction('pause')}
              >
                <PauseCircle className="size-4" />
                Pause billing
              </Button>
            )}
            {details.isPaused && details.canResume && (
              <Button
                variant="outline"
                size="sm"
                disabled={subscriptionAction !== null}
                onClick={() => void runSubscriptionAction('unpause')}
              >
                {subscriptionAction === 'unpause' && <Loader2 className="size-4 animate-spin" />}
                <PlayCircle className="size-4" />
                Resume billing
              </Button>
            )}
            {details.canCancel && (
              <Button
                variant="outline"
                size="sm"
                disabled={subscriptionAction !== null}
                onClick={() => setConfirmAction('cancel')}
              >
                <XCircle className="size-4" />
                Cancel subscription
              </Button>
            )}
            {(hasCustomer || details.hasStripeCustomer) && (
              <Button
                variant="ghost"
                size="sm"
                disabled={loadingPlan !== null}
                onClick={() => void openPortal()}
              >
                {loadingPlan === 'portal' && <Loader2 className="size-4 animate-spin" />}
                Payment method & invoices
              </Button>
            )}
          </div>
        )}

        {promoApplied && (
          <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
            Billing, renewal, pause, and cancel controls are not available for developer promo
            accounts. Contact support if you need to switch to paid billing.
          </p>
        )}
      </Card>

      <p className="text-sm text-muted-foreground">
        Your plan includes <strong>{PLATFORM_SEAT_LIMITS[resolvedPlan]} team seats</strong>
        {resolvedPlan === 'trial' && ', 2 crews'}
        {resolvedPlan === 'basic' && ', 5 crews, and reports'}
        {resolvedPlan === 'pro' && ', unlimited crews, routes, reports, and integrations'}
        .
      </p>

      {showPlanPicker && (
        <div className="grid gap-4 md:grid-cols-2">
          {paidPlans.map((planId) => {
            const info = pricingMap[planId]
            const isCurrent =
              resolvedPlan === planId &&
              (resolvedStatus === 'active' || resolvedStatus === 'past_due')
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
      )}

      {isStripeBilling && details && !promoApplied && (
        <p className="text-xs text-muted-foreground">
          Plan changes between Basic and Pro are handled through checkout. Canceling keeps access
          until the end of your current billing period.
        </p>
      )}

      {!detailsLoaded && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-3 animate-spin" />
          Loading subscription details…
        </p>
      )}

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'cancel' ? 'Cancel subscription?' : 'Pause billing?'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === 'cancel' ? (
                <>
                  Your team keeps access until{' '}
                  <strong>{renewalDate ?? 'the end of the billing period'}</strong>. After that,
                  dashboard and client portal access will end until you subscribe again.
                </>
              ) : (
                <>
                  Billing will pause immediately. Your team keeps access through{' '}
                  <strong>{renewalDate ?? 'the current period end'}</strong>. You can resume billing
                  anytime before then.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Go back
            </Button>
            <Button
              variant={confirmAction === 'cancel' ? 'destructive' : 'default'}
              disabled={subscriptionAction !== null}
              onClick={() =>
                void runSubscriptionAction(confirmAction === 'cancel' ? 'cancel' : 'pause')
              }
            >
              {subscriptionAction && <Loader2 className="size-4 animate-spin" />}
              {confirmAction === 'cancel' ? 'Cancel at period end' : 'Pause billing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}