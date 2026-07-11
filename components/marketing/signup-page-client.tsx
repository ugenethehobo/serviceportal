'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { EmbeddedPlatformCheckout } from '@/components/marketing/embedded-platform-checkout'
import { PricingCards } from '@/components/marketing/pricing-cards'
import { SignupAccountForm } from '@/components/marketing/signup-account-form'
import { SignupBetaAccessCode } from '@/components/marketing/signup-beta-access-code'
import { SignupPromoCode } from '@/components/marketing/signup-promo-code'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { type PlatformPlanId } from '@/lib/platform-billing'
import { betaAccessAppliedLabel } from '@/lib/platform-beta-access'
import {
  formatPlanPriceLine,
  pricingByPlanId,
  type BillingInterval,
  type PlatformPlanPricing,
  PLATFORM_TRIAL_DAYS,
} from '@/lib/platform-pricing'
import { promoAppliedLabel } from '@/lib/platform-promo'
import { isBetaReleaseMode, type PlatformReleaseMode } from '@/lib/platform-settings'
import { ArrowLeft } from 'lucide-react'

type SignupStep = 'plan' | 'beta-access' | 'payment' | 'account'

function isValidPlan(value: string | null): value is PlatformPlanId {
  return value === 'trial' || value === 'basic' || value === 'pro'
}

function isValidBillingInterval(value: string | null): value is BillingInterval {
  return value === 'month' || value === 'year'
}

function isPaidPlan(plan: PlatformPlanId | null): plan is 'basic' | 'pro' {
  return plan === 'basic' || plan === 'pro'
}

/** Paid checkout from landing pricing includes both plan and billing interval. */
function isPaidSignupFromPricing(
  isBeta: boolean,
  plan: PlatformPlanId | null,
  billing: string | null
): boolean {
  if (!isBeta) return isPaidPlan(plan)
  return isPaidPlan(plan) && isValidBillingInterval(billing)
}

interface SignupPageClientProps {
  plans: PlatformPlanPricing[]
  releaseMode: PlatformReleaseMode
}

export function SignupPageClient({ plans, releaseMode }: SignupPageClientProps) {
  const isBeta = isBetaReleaseMode(releaseMode)
  const searchParams = useSearchParams()
  const planParam = searchParams.get('plan')
  const billingParam = searchParams.get('billing')
  const initialSessionId = searchParams.get('session_id')

  const paidFromPricing = isPaidSignupFromPricing(
    isBeta,
    isValidPlan(planParam) ? planParam : null,
    billingParam
  )
  const initialPlan: PlatformPlanId | null = paidFromPricing
    ? (planParam as 'basic' | 'pro')
    : isBeta
      ? null
      : isValidPlan(planParam)
        ? planParam
        : null
  const initialBillingInterval = isValidBillingInterval(billingParam) ? billingParam : 'month'

  const pricingMap = useMemo(() => pricingByPlanId(plans), [plans])

  const [selectedPlan, setSelectedPlan] = useState<PlatformPlanId | null>(initialPlan)
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | undefined>(
    initialSessionId || undefined
  )
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>(initialBillingInterval)
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null)
  const [appliedBetaAccessCode, setAppliedBetaAccessCode] = useState<string | null>(null)
  const [step, setStep] = useState<SignupStep>(() => {
    if (initialSessionId && paidFromPricing) return 'account'
    if (isBeta) {
      if (paidFromPricing) return 'payment'
      return 'beta-access'
    }
    if (initialPlan === 'trial') return 'account'
    if (isPaidPlan(initialPlan)) return 'payment'
    return 'plan'
  })

  const isBetaAccessFlow = isBeta && step === 'beta-access'
  const isPaidFlow = step === 'payment' && isPaidPlan(selectedPlan)
  const effectivePlan: PlatformPlanId | null = appliedBetaAccessCode
    ? 'pro'
    : selectedPlan
  const planMeta = effectivePlan ? pricingMap[effectivePlan] : null

  const choosePlan = (plan: PlatformPlanId, interval: BillingInterval = 'month') => {
    if (isBeta && plan === 'trial') return
    setSelectedPlan(plan)
    setAppliedBetaAccessCode(null)
    if (plan === 'trial') {
      setStep('account')
      return
    }
    setBillingInterval(interval)
    setCheckoutSessionId(undefined)
    setAppliedPromoCode(null)
    setStep('payment')
  }

  const handlePaymentComplete = (sessionId: string) => {
    setCheckoutSessionId(sessionId)
    setStep('account')
  }

  const handleBetaCodeApplied = (code: string) => {
    setAppliedBetaAccessCode(code)
    setSelectedPlan('pro')
    setCheckoutSessionId(undefined)
    setAppliedPromoCode(null)
    setStep('account')
  }

  const showBackButton = step === 'account' || (isPaidFlow && paidFromPricing)

  const handleBack = () => {
    if (step === 'account') {
      if (appliedBetaAccessCode) {
        setAppliedBetaAccessCode(null)
        setSelectedPlan(null)
        setStep('beta-access')
        return
      }
      if (isPaidPlan(selectedPlan)) {
        setStep('payment')
        return
      }
    }
    if (isPaidFlow && paidFromPricing) {
      window.location.href = '/#pricing'
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="font-semibold tracking-tight text-lg">
            ServicePortal
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground hidden sm:inline">Already have an account?</span>
            <Link href="/login">
              <Button variant="outline" size="sm">Sign in</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            {isBetaAccessFlow
              ? 'Enter your beta code'
              : isBeta && isPaidFlow
                ? 'Subscribe to support us'
                : isBeta
                  ? 'Join the beta'
                  : 'Get started'}
          </h1>
          <p className="text-muted-foreground">
            {isBetaAccessFlow
              ? 'Use the invitation code from your beta access email to unlock Pro and create your account.'
              : isBeta && isPaidFlow
                ? 'Complete payment below, then set up your admin login.'
                : isBeta
                  ? 'Create your admin account to get started.'
                  : 'Choose a plan, subscribe in-page, then create your admin account.'}
          </p>
        </div>

        {showBackButton && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-0 text-muted-foreground"
            onClick={handleBack}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
        )}

        {!isBeta && step === 'plan' && (
          <PricingCards plans={plans} onSelectPlan={choosePlan} />
        )}

        {isBetaAccessFlow && (
          <Card className="max-w-lg p-6 shadow-sm space-y-6">
            <SignupBetaAccessCode
              isApplied={false}
              onApplied={handleBetaCodeApplied}
              onClear={() => undefined}
            />
            <p className="text-sm text-muted-foreground text-center">
              Want to support development instead?{' '}
              <Link href="/#pricing" className="font-medium text-foreground underline underline-offset-4">
                View paid plans
              </Link>
            </p>
          </Card>
        )}

        {isPaidFlow && selectedPlan && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">
                  Subscribe to {planMeta?.label}
                  {planMeta && (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      · {formatPlanPriceLine(planMeta, billingInterval)}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {appliedPromoCode
                    ? 'Promo applied — continue to create your account.'
                    : isBeta
                      ? 'Pay below to subscribe, then create your login.'
                      : 'Pay below or apply a promo code, then create your login.'}
                </p>
              </div>
              {appliedPromoCode && (
                <Button onClick={() => setStep('account')}>Continue to account setup</Button>
              )}
            </div>

            {!isBeta && (
              <SignupPromoCode
                plan={selectedPlan}
                isApplied={Boolean(appliedPromoCode)}
                onApplied={(code) => {
                  setAppliedPromoCode(code)
                  setCheckoutSessionId(undefined)
                }}
                onClear={() => setAppliedPromoCode(null)}
              />
            )}

            {!appliedPromoCode && (
              <EmbeddedPlatformCheckout
                plan={selectedPlan}
                billingInterval={billingInterval}
                onComplete={handlePaymentComplete}
              />
            )}
          </div>
        )}

        {step === 'account' && effectivePlan && planMeta && (
          <Card className="p-6 max-w-lg shadow-sm">
            <div className="mb-6 space-y-1">
              <h2 className="text-xl font-semibold">Create your account</h2>
              <p className="text-sm text-muted-foreground">
                {effectivePlan === 'trial'
                  ? `Your ${PLATFORM_TRIAL_DAYS}-day trial starts when you finish setup.`
                  : appliedBetaAccessCode
                    ? `${betaAccessAppliedLabel()} — set up your Pro admin login.`
                    : appliedPromoCode
                      ? `${promoAppliedLabel()} on ${planMeta.label} — set up your admin login.`
                      : `Your ${planMeta.label} subscription is ready — set up your admin login.`}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="secondary">
                  {planMeta.label} · {planMeta.seatLimit} seats
                </Badge>
                {appliedBetaAccessCode && (
                  <Badge variant="outline" className="text-emerald-700 border-emerald-500/40">
                    {betaAccessAppliedLabel()}
                  </Badge>
                )}
                {appliedPromoCode && (
                  <Badge variant="outline" className="text-emerald-700 border-emerald-500/40">
                    {promoAppliedLabel()}
                  </Badge>
                )}
              </div>
            </div>
            <SignupAccountForm
              plan={effectivePlan}
              checkoutSessionId={checkoutSessionId}
              promoCode={appliedPromoCode || undefined}
              betaAccessCode={appliedBetaAccessCode || undefined}
            />
          </Card>
        )}
      </main>
    </div>
  )
}