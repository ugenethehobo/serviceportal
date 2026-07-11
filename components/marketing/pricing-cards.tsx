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
import { Check, Sparkles } from 'lucide-react'

interface PricingCardsProps {
  plans: PlatformPlanPricing[]
  highlightedPlan?: 'basic' | 'pro' | 'trial'
  className?: string
  variant?: 'default' | 'landing'
  defaultBillingInterval?: BillingInterval
  /** Landing beta: replace free-trial card with beta access request card */
  betaMode?: boolean
  /** Signup beta: omit trial plan entirely */
  hideTrial?: boolean
  onRequestBetaAccess?: () => void
  onSelectPlan?: (
    planId: PlatformPlanPricing['planId'],
    billingInterval: BillingInterval
  ) => void
}

function BillingIntervalToggle({
  value,
  onChange,
  isLanding,
  betaMode,
  annualSavingsPercent,
}: {
  value: BillingInterval
  onChange: (interval: BillingInterval) => void
  isLanding: boolean
  betaMode: boolean
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
              isLanding &&
                betaMode &&
                value !== 'year' &&
                'bg-amber-400/20 text-amber-200',
              isLanding &&
                betaMode &&
                value === 'year' &&
                'bg-amber-400 text-amber-950',
              isLanding &&
                !betaMode &&
                value !== 'year' &&
                'bg-white/15 text-white/80',
              isLanding && !betaMode && value === 'year' && 'bg-white text-slate-950'
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
  betaMode = false,
  hideTrial = false,
  onRequestBetaAccess,
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

  const visiblePlanIds = PLATFORM_PRICING_PLAN_ORDER.filter(
    (planId) => !hideTrial || planId !== 'trial'
  )

  return (
    <div className={className}>
      {showBillingToggle ? (
        <BillingIntervalToggle
          value={billingInterval}
          onChange={setBillingInterval}
          isLanding={isLanding}
          betaMode={betaMode}
          annualSavingsPercent={annualSavingsPercent}
        />
      ) : null}

      <div
        className={cn(
          'grid gap-4',
          visiblePlanIds.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'
        )}
      >
        {visiblePlanIds.map((planId) => {
          const plan = pricingMap[planId]
          const isBetaAccessCard = betaMode && planId === 'trial'
          const highlighted = isBetaAccessCard ? false : planId === highlightedPlan
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
                      highlighted && 'border-white/45 bg-black/65 ring-1 ring-white/25',
                      isBetaAccessCard &&
                        'border-[#FF4F00]/35 bg-gradient-to-b from-[#FF4F00]/10 to-black/55'
                    )
                  : cn('shadow-sm', highlighted && 'border-primary shadow-md')
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {isBetaAccessCard ? 'Beta access' : plan.label}
                </h3>
                {isBetaAccessCard ? (
                  <Badge
                    variant="outline"
                    className={
                      isLanding
                        ? 'border-[#FF4F00]/40 bg-[#FF4F00]/15 text-[#FF4F00]'
                        : undefined
                    }
                  >
                    Invite only
                  </Badge>
                ) : planId === 'trial' ? (
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
                ) : null}
              </div>

              <p className="mt-4 text-3xl font-bold">
                {isBetaAccessCard ? 'Free' : priceOption ? formatPlanPriceLine(plan, priceOption.interval) : '—'}
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
              ) : isBetaAccessCard ? (
                <p
                  className={cn(
                    'mt-1 text-sm',
                    isLanding ? 'text-white/60' : 'text-muted-foreground'
                  )}
                >
                  Pro tier when approved
                </p>
              ) : null}

              <p
                className={cn(
                  'mt-2 flex-1 text-sm',
                  isLanding ? 'text-white/75' : 'text-muted-foreground'
                )}
              >
                {isBetaAccessCard
                  ? 'Request access to try ServicePortal during beta. Approved teams receive Pro tier access via invitation code.'
                  : plan.description}
              </p>

              <ul className="mt-4 space-y-2 text-sm">
                {isBetaAccessCard ? (
                  <>
                    <li className="flex items-center gap-2">
                      <Sparkles
                        className={cn('size-4', isLanding ? 'text-[#FF4F00]' : 'text-primary')}
                      />
                      Pro tier during beta
                    </li>
                    <li className="flex items-center gap-2">
                      <Check
                        className={cn(
                          'size-4',
                          isLanding
                            ? betaMode
                              ? 'text-amber-300'
                              : 'text-[#FF4F00]'
                            : 'text-primary'
                        )}
                      />
                      Full platform access
                    </li>
                  </>
                ) : (
                  <li className="flex items-center gap-2">
                    <Check
                      className={cn(
                        'size-4',
                        isLanding
                          ? betaMode
                            ? 'text-amber-300'
                            : 'text-[#FF4F00]'
                          : 'text-primary'
                      )}
                    />
                    {plan.seatLimit} team seats included
                  </li>
                )}
              </ul>

              {isBetaAccessCard && onRequestBetaAccess ? (
                <Button
                  className={cn(
                    'mt-6 w-full',
                    isLanding &&
                      'border-[#FF4F00]/40 bg-[#FF4F00] text-white hover:bg-[#E64600]'
                  )}
                  onClick={onRequestBetaAccess}
                >
                  Request beta access
                </Button>
              ) : onSelectPlan ? (
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
                    {planId === 'trial'
                      ? 'Start free trial'
                      : betaMode && isLanding
                        ? `Subscribe to ${plan.label}`
                        : `Get ${plan.label}`}
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