'use client'

import { useMemo, useState } from 'react'
import { BetaAccessRequestDialog } from '@/components/marketing/beta-access-request-dialog'
import { LandingScrollReveal } from '@/components/marketing/landing-scroll-reveal'
import { PricingCards } from '@/components/marketing/pricing-cards'
import {
  getPlanPriceOption,
  pricingByPlanId,
  PLATFORM_TRIAL_DAYS,
  type PlatformPlanPricing,
} from '@/lib/platform-pricing'
import { isBetaReleaseMode, type PlatformReleaseMode } from '@/lib/platform-settings'
import { cn } from '@/lib/utils'

type LandingPricingBandProps = {
  plans: PlatformPlanPricing[]
  releaseMode: PlatformReleaseMode
}

export function LandingPricingBand({ plans, releaseMode }: LandingPricingBandProps) {
  const isBeta = isBetaReleaseMode(releaseMode)
  const [requestOpen, setRequestOpen] = useState(false)
  const pricingMap = useMemo(() => pricingByPlanId(plans), [plans])
  const hasAnnualPricing = Boolean(
    getPlanPriceOption(pricingMap.basic, 'year')?.stripePriceId &&
      getPlanPriceOption(pricingMap.pro, 'year')?.stripePriceId
  )

  return (
    <section id="pricing" className="scroll-mt-24 bg-[#0A0A0A] text-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <LandingScrollReveal className="mx-auto max-w-3xl text-center">
          <p
            className={cn(
              'font-mono text-xs tracking-[0.25em] uppercase',
              isBeta ? 'text-[#FF4F00]' : 'text-white/50'
            )}
          >
            {isBeta ? 'Beta pricing' : 'Pricing'}
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Pick your deployment.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/55 sm:text-lg">
            {isBeta
              ? 'Request beta access to get started — or subscribe now to support the product while we&apos;re in beta.'
              : `${PLATFORM_TRIAL_DAYS}-day free trial on every plan. Scale when your crews do.`}
          </p>
        </LandingScrollReveal>

        <LandingScrollReveal className="mt-12" delay={100}>
          <PricingCards
            plans={plans}
            variant="landing"
            highlightedPlan="pro"
            defaultBillingInterval={hasAnnualPricing ? 'year' : 'month'}
            betaMode={isBeta}
            onRequestBetaAccess={isBeta ? () => setRequestOpen(true) : undefined}
          />
        </LandingScrollReveal>
      </div>

      {isBeta && (
        <BetaAccessRequestDialog open={requestOpen} onOpenChange={setRequestOpen} />
      )}
    </section>
  )
}