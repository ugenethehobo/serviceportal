'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  formatPlanPriceLine,
  PLATFORM_PRICING_PLAN_ORDER,
  PLATFORM_TRIAL_DAYS,
  pricingByPlanId,
  type PlatformPlanPricing,
} from '@/lib/platform-pricing'
import { Check } from 'lucide-react'

interface PricingCardsProps {
  plans: PlatformPlanPricing[]
  highlightedPlan?: 'basic' | 'pro' | 'trial'
  className?: string
  onSelectPlan?: (planId: PlatformPlanPricing['planId']) => void
}

export function PricingCards({
  plans,
  highlightedPlan = 'basic',
  className,
  onSelectPlan,
}: PricingCardsProps) {
  const pricingMap = pricingByPlanId(plans)

  return (
    <div className={`grid gap-4 md:grid-cols-3 ${className || ''}`}>
      {PLATFORM_PRICING_PLAN_ORDER.map((planId) => {
        const plan = pricingMap[planId]
        const highlighted = planId === highlightedPlan
        return (
          <Card
            key={planId}
            className={`p-6 flex flex-col ${highlighted ? 'border-primary shadow-md' : 'shadow-sm'}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{plan.label}</h3>
              {planId === 'trial' && (
                <Badge variant="outline">{PLATFORM_TRIAL_DAYS} days</Badge>
              )}
            </div>
            <p className="text-3xl font-bold mt-4">{formatPlanPriceLine(plan)}</p>
            <p className="text-sm text-muted-foreground mt-2 flex-1">{plan.description}</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="size-4 text-primary" />
                {plan.seatLimit} team seats included
              </li>
            </ul>
            {onSelectPlan ? (
              <Button
                className="w-full mt-6"
                variant={highlighted ? 'default' : 'outline'}
                onClick={() => onSelectPlan(planId)}
              >
                {planId === 'trial' ? 'Start free trial' : `Choose ${plan.label}`}
              </Button>
            ) : (
              <Link href={`/signup?plan=${planId}`} className="block mt-6">
                <Button className="w-full" variant={highlighted ? 'default' : 'outline'}>
                  {planId === 'trial' ? 'Start free trial' : `Get ${plan.label}`}
                </Button>
              </Link>
            )}
          </Card>
        )
      })}
    </div>
  )
}