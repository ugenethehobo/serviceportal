'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { EmbeddedPlatformCheckout } from '@/components/marketing/embedded-platform-checkout'
import { SignupAccountForm } from '@/components/marketing/signup-account-form'
import { SignupPromoCode } from '@/components/marketing/signup-promo-code'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  PLATFORM_PLANS,
  PLATFORM_SEAT_LIMITS,
  PLATFORM_TRIAL_DAYS,
  type PlatformPlanId,
} from '@/lib/platform-billing'
import { ArrowLeft, Check } from 'lucide-react'

type SignupStep = 'plan' | 'payment' | 'account'

const PLAN_ORDER: PlatformPlanId[] = ['trial', 'basic', 'pro']

function isValidPlan(value: string | null): value is PlatformPlanId {
  return value === 'trial' || value === 'basic' || value === 'pro'
}

export function SignupPageClient() {
  const searchParams = useSearchParams()
  const planParam = searchParams.get('plan')
  const initialPlan = isValidPlan(planParam) ? planParam : null
  const initialSessionId = searchParams.get('session_id')

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

  const planMeta = useMemo(
    () => (selectedPlan ? PLATFORM_PLANS[selectedPlan] : null),
    [selectedPlan]
  )

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
          <div className="grid gap-4 md:grid-cols-3">
            {PLAN_ORDER.map((planId) => {
              const plan = PLATFORM_PLANS[planId]
              const highlighted = planId === 'basic'
              return (
                <Card
                  key={planId}
                  className={`p-6 flex flex-col shadow-sm ${highlighted ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">{plan.label}</h2>
                    {planId === 'trial' && (
                      <Badge variant="outline">{PLATFORM_TRIAL_DAYS}-day trial</Badge>
                    )}
                  </div>
                  <p className="text-3xl font-bold mt-3">
                    {plan.monthlyPrice === 0 ? 'Free' : `$${plan.monthlyPrice}`}
                    {plan.monthlyPrice > 0 && (
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2 flex-1">{plan.description}</p>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-primary shrink-0" />
                      {PLATFORM_SEAT_LIMITS[planId]} team seats
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-primary shrink-0" />
                      Clients, jobs, billing & portal
                    </li>
                  </ul>
                  <Button className="mt-6 w-full" onClick={() => choosePlan(planId)}>
                    {planId === 'trial' ? 'Start free trial' : `Choose ${plan.label}`}
                  </Button>
                </Card>
              )
            })}
          </div>
        )}

        {step === 'payment' && selectedPlan && (selectedPlan === 'basic' || selectedPlan === 'pro') && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Subscribe to {planMeta?.label}</h2>
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
              appliedCode={appliedPromoCode}
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

        {step === 'account' && selectedPlan && (
          <Card className="p-6 max-w-lg shadow-sm">
            <div className="mb-6 space-y-1">
              <h2 className="text-xl font-semibold">Create your account</h2>
              <p className="text-sm text-muted-foreground">
                {selectedPlan === 'trial'
                  ? `Your ${PLATFORM_TRIAL_DAYS}-day trial starts when you finish setup.`
                  : appliedPromoCode
                    ? `Dev promo active on ${planMeta?.label} — set up your admin login.`
                    : `Your ${planMeta?.label} subscription is ready — set up your admin login.`}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="secondary">
                  {planMeta?.label} · {PLATFORM_SEAT_LIMITS[selectedPlan]} seats
                </Badge>
                {appliedPromoCode && (
                  <Badge variant="outline" className="text-emerald-700 border-emerald-500/40">
                    Promo: {appliedPromoCode}
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