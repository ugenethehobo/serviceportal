'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { LandingScrollReveal } from '@/components/marketing/landing-scroll-reveal'
import { PricingCards } from '@/components/marketing/pricing-cards'
import { Button } from '@/components/ui/button'
import {
  getPlanPriceOption,
  pricingByPlanId,
  PLATFORM_TRIAL_DAYS,
  type PlatformPlanPricing,
} from '@/lib/platform-pricing'
import { LANDING_CLOSING } from '@/lib/landing-page-config'

type LandingPricingBandProps = {
  plans: PlatformPlanPricing[]
}

export function LandingPricingBand({ plans }: LandingPricingBandProps) {
  const pricingMap = useMemo(() => pricingByPlanId(plans), [plans])
  const hasAnnualPricing = Boolean(
    getPlanPriceOption(pricingMap.basic, 'year')?.stripePriceId &&
      getPlanPriceOption(pricingMap.pro, 'year')?.stripePriceId
  )

  return (
    <section id="pricing" className="scroll-mt-24 bg-[#0A0A0A] text-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <LandingScrollReveal className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs tracking-[0.25em] text-[#FF4F00] uppercase">
            Beta pricing
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Pick your deployment.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/55 sm:text-lg">
            {PLATFORM_TRIAL_DAYS}-day free trial on every plan. Scale when your crews do.
          </p>
        </LandingScrollReveal>

        <LandingScrollReveal className="mt-12" delay={100}>
          <PricingCards
            plans={plans}
            variant="landing"
            highlightedPlan="pro"
            defaultBillingInterval={hasAnnualPricing ? 'year' : 'month'}
          />
        </LandingScrollReveal>

        <LandingScrollReveal
          className="mt-20 flex flex-col items-center gap-6 text-center"
          delay={180}
        >
          <h3 className="text-2xl font-bold tracking-tight sm:text-4xl">
            {LANDING_CLOSING.headline}
          </h3>
          <p className="max-w-lg text-white/55">{LANDING_CLOSING.subheadline}</p>
          <Link href="/signup?plan=trial">
            <Button
              size="lg"
              className="h-12 rounded-full bg-[#FF4F00] px-10 text-base font-semibold text-white hover:bg-[#E64600]"
            >
              Start free trial
            </Button>
          </Link>
        </LandingScrollReveal>
      </div>
    </section>
  )
}