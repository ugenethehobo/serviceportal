import {
  PLATFORM_PLANS,
  PLATFORM_SEAT_LIMITS,
  PLATFORM_TRIAL_DAYS,
  type PlatformPlanId,
} from '@/lib/platform-billing'

export type BillingInterval = 'month' | 'year'

export type PlatformPlanPriceOption = {
  interval: BillingInterval
  /** Normalized monthly amount in major currency units (for MRR math) */
  monthlyPrice: number
  /** Primary display amount, e.g. 49 or 470 */
  priceAmount: number
  priceDisplay: string
  intervalLabel: string
  currency: string
  stripePriceId: string | null
}

export type PlatformPlanPricing = {
  planId: PlatformPlanId
  label: string
  description: string
  seatLimit: number
  priceOptions: PlatformPlanPriceOption[]
}

export function getPlanPriceOption(
  pricing: PlatformPlanPricing,
  interval: BillingInterval = 'month'
): PlatformPlanPriceOption | null {
  return pricing.priceOptions.find((option) => option.interval === interval) ?? null
}

export function buildTrialPlanPricing(): PlatformPlanPricing {
  return {
    planId: 'trial',
    label: PLATFORM_PLANS.trial.label,
    description: PLATFORM_PLANS.trial.description,
    seatLimit: PLATFORM_SEAT_LIMITS.trial,
    priceOptions: [
      {
        interval: 'month',
        monthlyPrice: 0,
        priceAmount: 0,
        priceDisplay: 'Free',
        intervalLabel: '',
        currency: 'usd',
        stripePriceId: null,
      },
    ],
  }
}

export function formatPlanPriceLine(
  pricing: PlatformPlanPricing,
  interval: BillingInterval = 'month'
): string {
  const option = getPlanPriceOption(pricing, interval)
  if (!option || option.priceDisplay === 'Free') return 'Free'
  return `${option.priceDisplay}${option.intervalLabel}`
}

export function formatPlanMonthlyEquivalent(
  pricing: PlatformPlanPricing,
  interval: BillingInterval
): string | null {
  if (interval !== 'year') return null
  const annual = getPlanPriceOption(pricing, 'year')
  if (!annual || annual.priceAmount <= 0) return null
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: annual.currency.toUpperCase(),
    minimumFractionDigits: annual.monthlyPrice % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(annual.monthlyPrice)
  return `${formatted}/mo billed annually`
}

export function computeAnnualSavingsPercent(
  monthly: PlatformPlanPriceOption | null,
  annual: PlatformPlanPriceOption | null
): number | null {
  if (!monthly || !annual || monthly.priceAmount <= 0 || annual.priceAmount <= 0) {
    return null
  }
  const yearlyAtMonthlyRate = monthly.priceAmount * 12
  if (yearlyAtMonthlyRate <= annual.priceAmount) return null
  return Math.round(((yearlyAtMonthlyRate - annual.priceAmount) / yearlyAtMonthlyRate) * 100)
}

export function pricingByPlanId(
  plans: PlatformPlanPricing[]
): Record<PlatformPlanId, PlatformPlanPricing> {
  return {
    trial: buildTrialPlanPricing(),
    basic: plans.find((p) => p.planId === 'basic') || fallbackPaidPricing('basic'),
    pro: plans.find((p) => p.planId === 'pro') || fallbackPaidPricing('pro'),
  }
}

function fallbackPaidPricing(planId: 'basic' | 'pro'): PlatformPlanPricing {
  const meta = PLATFORM_PLANS[planId]
  const missingOption: PlatformPlanPriceOption = {
    interval: 'month',
    monthlyPrice: 0,
    priceAmount: 0,
    priceDisplay: '—',
    intervalLabel: '',
    currency: 'usd',
    stripePriceId: null,
  }
  return {
    planId,
    label: meta.label,
    description: meta.description,
    seatLimit: PLATFORM_SEAT_LIMITS[planId],
    priceOptions: [missingOption],
  }
}

export const PLATFORM_PRICING_PLAN_ORDER: PlatformPlanId[] = ['trial', 'basic', 'pro']

export { PLATFORM_TRIAL_DAYS, PLATFORM_SEAT_LIMITS }