import {
  PLATFORM_PLANS,
  PLATFORM_SEAT_LIMITS,
  PLATFORM_TRIAL_DAYS,
  type PlatformPlanId,
} from '@/lib/platform-billing'

export type PlatformPlanPricing = {
  planId: PlatformPlanId
  label: string
  description: string
  /** Normalized monthly amount in major currency units (for MRR math) */
  monthlyPrice: number
  /** Primary display amount, e.g. 49 */
  priceAmount: number
  priceDisplay: string
  intervalLabel: string
  currency: string
  seatLimit: number
  stripePriceId: string | null
}

export function buildTrialPlanPricing(): PlatformPlanPricing {
  return {
    planId: 'trial',
    label: PLATFORM_PLANS.trial.label,
    description: PLATFORM_PLANS.trial.description,
    monthlyPrice: 0,
    priceAmount: 0,
    priceDisplay: 'Free',
    intervalLabel: '',
    currency: 'usd',
    seatLimit: PLATFORM_SEAT_LIMITS.trial,
    stripePriceId: null,
  }
}

export function formatPlanPriceLine(pricing: PlatformPlanPricing): string {
  if (pricing.priceDisplay === 'Free') return 'Free'
  return `${pricing.priceDisplay}${pricing.intervalLabel}`
}

export function pricingByPlanId(
  plans: PlatformPlanPricing[]
): Record<PlatformPlanId, PlatformPlanPricing> {
  const map = {
    trial: buildTrialPlanPricing(),
    basic: plans.find((p) => p.planId === 'basic') || fallbackPaidPricing('basic'),
    pro: plans.find((p) => p.planId === 'pro') || fallbackPaidPricing('pro'),
  }
  return map
}

function fallbackPaidPricing(planId: 'basic' | 'pro'): PlatformPlanPricing {
  const meta = PLATFORM_PLANS[planId]
  return {
    planId,
    label: meta.label,
    description: meta.description,
    monthlyPrice: 0,
    priceAmount: 0,
    priceDisplay: '—',
    intervalLabel: '',
    currency: 'usd',
    seatLimit: PLATFORM_SEAT_LIMITS[planId],
    stripePriceId: null,
  }
}

export const PLATFORM_PRICING_PLAN_ORDER: PlatformPlanId[] = ['trial', 'basic', 'pro']

export { PLATFORM_TRIAL_DAYS, PLATFORM_SEAT_LIMITS }