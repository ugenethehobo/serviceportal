'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { EmbeddedPlatformCheckout } from '@/components/marketing/embedded-platform-checkout'
import { PricingCards } from '@/components/marketing/pricing-cards'
import { SignupAccountForm } from '@/components/marketing/signup-account-form'
import { SignupPromoCode } from '@/components/marketing/signup-promo-code'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PLATFORM_TRIAL_DAYS, type PlatformPlanId } from '@/lib/platform-billing'
import { formatPlanPriceLine, pricingByPlanId, type PlatformPlanPricing } from '@/lib/platform-pricing'
import { promoAppliedLabel } from '@/lib/platform-promo'
import { ArrowLeft } from 'lucide-react'

type SignupStep = 'plan' | 'payment' | 'account'

function isValidPlan(value: string | null): value is PlatformPlanId {
  return value === 'trial' || value === 'basic' || value === 'pro'
}

interface SignupPageClientProps {
  plans: PlatformPlanPricing[]
}

export function SignupPageClient({ plans }: SignupPageClientProps) {
  const searchParams = useSearchParams()
  const planParam = searchParams.get('plan')
  const initialPlan = isValidPlan(planParam) ? planParam : null
  const initialSessionId = searchParams.get('session_id')

  const pricingMap = useMemo(() => pricingByPlanId(plans), [plans])

  const [selectedPlan, setSelectedPlan] = useState<PlatformPlanId | null>(initialPlan)
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | undefined>(
    initialSessionId || undefined
  )
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null)
  const [step, setStep] = useState<SignupStep>(() => {
    if (initialSessionId && (initialPlan === 'basic' || initialPlan === 'pro')) return 'account'
    if (initialPlan === 'trial') return 'account'
    if (initialPlan === 'basic' || initialPlan === 'pro') return 'payment'
    return 'plan'
  })

  const planMeta = selectedPlan ? pricingMap[selectedPlan] : null

  const choosePlan = (plan: PlatformPlanId) => {
    setSelectedPlan(plan)
    if (plan === 'trial') {
      setStep('account')
      return
    }
    setCheckoutSessionId(undefined)
    setAppliedPromoCode(null)
    setStep('payment')
  }

  const handlePaymentComplete = (sessionId: string) => {
    setCheckoutSessionId(sessionId)
    setStep('account')
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
          <h1 className="text-3xl font-bold tracking-tight">Get started</h1>
          <p className="text-muted-foreground">
            Choose a plan, subscribe in-page, then create your admin account.
          </p>
        </div>

        {step !== 'plan' && selectedPlan && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-0 text-muted-foreground"
            onClick={() => {
              if (step === 'account' && selectedPlan !== 'trial') {
                setStep('payment')
                return
              }
              setStep('plan')
              setSelectedPlan(null)
              setCheckoutSessionId(undefined)
              setAppliedPromoCode(null)
            }}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
        )}

        {step === 'plan' && (
          <PricingCards plans={plans} onSelectPlan={choosePlan} />
        )}

        {step === 'payment' && selectedPlan && (selectedPlan === 'basic' || selectedPlan === 'pro') && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">
                  Subscribe to {planMeta?.label}
                  {planMeta && (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      · {formatPlanPriceLine(planMeta)}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {appliedPromoCode
                    ? 'Promo applied — continue to create your account.'
                    : 'Pay below or apply a promo code, then create your login.'}
                </p>
              </div>
              {appliedPromoCode && (
                <Button onClick={() => setStep('account')}>Continue to account setup</Button>
              )}
            </div>

            <SignupPromoCode
              plan={selectedPlan}
              isApplied={Boolean(appliedPromoCode)}
              onApplied={(code) => {
                setAppliedPromoCode(code)
                setCheckoutSessionId(undefined)
              }}
              onClear={() => setAppliedPromoCode(null)}
            />

            {!appliedPromoCode && (
              <EmbeddedPlatformCheckout plan={selectedPlan} onComplete={handlePaymentComplete} />
            )}
          </div>
        )}

        {step === 'account' && selectedPlan && planMeta && (
          <Card className="p-6 max-w-lg shadow-sm">
            <div className="mb-6 space-y-1">
              <h2 className="text-xl font-semibold">Create your account</h2>
              <p className="text-sm text-muted-foreground">
                {selectedPlan === 'trial'
                  ? `Your ${PLATFORM_TRIAL_DAYS}-day trial starts when you finish setup.`
                  : appliedPromoCode
                    ? `${promoAppliedLabel()} on ${planMeta.label} — set up your admin login.`
                    : `Your ${planMeta.label} subscription is ready — set up your admin login.`}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="secondary">
                  {planMeta.label} · {planMeta.seatLimit} seats
                </Badge>
                {appliedPromoCode && (
                  <Badge variant="outline" className="text-emerald-700 border-emerald-500/40">
                    {promoAppliedLabel()}
                  </Badge>
                )}
              </div>
            </div>
            <SignupAccountForm
              plan={selectedPlan}
              checkoutSessionId={checkoutSessionId}
              promoCode={appliedPromoCode || undefined}
            />
          </Card>
        )}
      </main>
    </div>
  )
}