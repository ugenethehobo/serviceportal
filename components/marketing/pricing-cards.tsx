'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  computeAnnualSavingsPercent,
  formatPlanMonthlyEquivalent,
  formatPlanPriceLine,
  getPlanPriceOption,
  PLATFORM_PRICING_PLAN_ORDER,
  PLATFORM_TRIAL_DAYS,
  pricingByPlanId,
  type BillingInterval,
  type PlatformPlanPricing,
} from '@/lib/platform-pricing'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface PricingCardsProps {
  plans: PlatformPlanPricing[]
  highlightedPlan?: 'basic' | 'pro' | 'trial'
  className?: string
  variant?: 'default' | 'landing'
  defaultBillingInterval?: BillingInterval
  onSelectPlan?: (
    planId: PlatformPlanPricing['planId'],
    billingInterval: BillingInterval
  ) => void
}

function BillingIntervalToggle({
  value,
  onChange,
  isLanding,
  annualSavingsPercent,
}: {
  value: BillingInterval
  onChange: (interval: BillingInterval) => void
  isLanding: boolean
  annualSavingsPercent: number | null
}) {
  return (
    <div
      className={cn(
        'mx-auto mb-8 flex w-fit items-center gap-1 rounded-full p-1',
        isLanding
          ? 'border border-white/20 bg-black/45 backdrop-blur-md'
          : 'border bg-muted/60'
      )}
    >
      <button
        type="button"
        onClick={() => onChange('month')}
        className={cn(
          'rounded-full px-4 py-2 text-sm font-medium transition-colors',
          value === 'month'
            ? isLanding
              ? 'bg-white text-slate-950'
              : 'bg-background text-foreground shadow-sm'
            : isLanding
              ? 'text-white/70 hover:text-white'
              : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange('year')}
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
          value === 'year'
            ? isLanding
              ? 'bg-white text-slate-950'
              : 'bg-background text-foreground shadow-sm'
            : isLanding
              ? 'text-white/70 hover:text-white'
              : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Annual
        {annualSavingsPercent ? (
          <Badge
            variant="secondary"
            className={cn(
              'border-0 px-2 py-0 text-[10px]',
              isLanding && value !== 'year' && 'bg-amber-400/20 text-amber-200',
              isLanding && value === 'year' && 'bg-amber-400 text-amber-950'
            )}
          >
            Save {annualSavingsPercent}%
          </Badge>
        ) : null}
      </button>
    </div>
  )
}

export function PricingCards({
  plans,
  highlightedPlan = 'basic',
  className,
  variant = 'default',
  defaultBillingInterval = 'month',
  onSelectPlan,
}: PricingCardsProps) {
  const pricingMap = pricingByPlanId(plans)
  const isLanding = variant === 'landing'
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>(defaultBillingInterval)

  const basicMonthly = getPlanPriceOption(pricingMap.basic, 'month')
  const basicAnnual = getPlanPriceOption(pricingMap.basic, 'year')
  const annualSavingsPercent = computeAnnualSavingsPercent(basicMonthly, basicAnnual)

  const showBillingToggle =
    Boolean(basicMonthly?.stripePriceId) && Boolean(basicAnnual?.stripePriceId)

  return (
    <div className={className}>
      {showBillingToggle ? (
        <BillingIntervalToggle
          value={billingInterval}
          onChange={setBillingInterval}
          isLanding={isLanding}
          annualSavingsPercent={annualSavingsPercent}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {PLATFORM_PRICING_PLAN_ORDER.map((planId) => {
          const plan = pricingMap[planId]
          const highlighted = planId === highlightedPlan
          const priceOption =
            planId === 'trial'
              ? getPlanPriceOption(plan, 'month')
              : getPlanPriceOption(plan, billingInterval) ||
                getPlanPriceOption(plan, 'month')
          const monthlyEquivalent =
            planId !== 'trial' ? formatPlanMonthlyEquivalent(plan, billingInterval) : null

          return (
            <Card
              key={planId}
              className={cn(
                'flex flex-col p-6',
                isLanding
                  ? cn(
                      'border-white/25 bg-black/55 text-white shadow-lg shadow-black/25 backdrop-blur-lg',
                      highlighted && 'border-white/45 bg-black/65 ring-1 ring-white/25'
                    )
                  : cn('shadow-sm', highlighted && 'border-primary shadow-md')
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{plan.label}</h3>
                {planId === 'trial' && (
                  <Badge
                    variant="outline"
                    className={
                      isLanding
                        ? 'border-white/30 bg-white/10 text-white'
                        : undefined
                    }
                  >
                    {PLATFORM_TRIAL_DAYS} days
                  </Badge>
                )}
              </div>
              <p className="mt-4 text-3xl font-bold">
                {priceOption ? formatPlanPriceLine(plan, priceOption.interval) : '—'}
              </p>
              {monthlyEquivalent ? (
                <p
                  className={cn(
                    'mt-1 text-sm',
                    isLanding ? 'text-white/60' : 'text-muted-foreground'
                  )}
                >
                  {monthlyEquivalent}
                </p>
              ) : null}
              <p
                className={cn(
                  'mt-2 flex-1 text-sm',
                  isLanding ? 'text-white/75' : 'text-muted-foreground'
                )}
              >
                {plan.description}
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check
                    className={cn('size-4', isLanding ? 'text-amber-300' : 'text-primary')}
                  />
                  {plan.seatLimit} team seats included
                </li>
              </ul>
              {onSelectPlan ? (
                <Button
                  className={cn(
                    'mt-6 w-full',
                    isLanding &&
                      !highlighted &&
                      'border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white'
                  )}
                  variant={highlighted ? 'default' : 'outline'}
                  onClick={() =>
                    onSelectPlan(planId, planId === 'trial' ? 'month' : billingInterval)
                  }
                >
                  {planId === 'trial' ? 'Start free trial' : `Choose ${plan.label}`}
                </Button>
              ) : (
                <Link
                  href={
                    planId === 'trial'
                      ? '/signup?plan=trial'
                      : `/signup?plan=${planId}&billing=${billingInterval}`
                  }
                  className="mt-6 block"
                >
                  <Button
                    className={cn(
                      'w-full',
                      isLanding &&
                        (highlighted
                          ? 'bg-white text-slate-950 hover:bg-white/90'
                          : 'border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white')
                    )}
                    variant={highlighted ? 'default' : 'outline'}
                  >
                    {planId === 'trial' ? 'Start free trial' : `Get ${plan.label}`}
                  </Button>
                </Link>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}