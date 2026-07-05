import { unstable_cache } from 'next/cache'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import {
  getPlatformPriceId,
  PLATFORM_PLANS,
  PLATFORM_SEAT_LIMITS,
  type PlatformPlanId,
} from '@/lib/platform-billing'
import {
  buildTrialPlanPricing,
  type PlatformPlanPricing,
} from '@/lib/platform-pricing'

function formatCurrencyAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function normalizeToMonthlyPrice(
  unitAmountCents: number,
  interval: Stripe.Price.Recurring.Interval | undefined,
  intervalCount: number | undefined
): number {
  const amount = unitAmountCents / 100
  const count = intervalCount || 1

  switch (interval) {
    case 'year':
      return Math.round((amount / (12 * count)) * 100) / 100
    case 'week':
      return Math.round(((amount * 52) / (12 * count)) * 100) / 100
    case 'day':
      return Math.round(((amount * 365) / (12 * count)) * 100) / 100
    case 'month':
    default:
      return Math.round((amount / count) * 100) / 100
  }
}

function intervalSuffix(
  interval: Stripe.Price.Recurring.Interval | undefined,
  intervalCount: number | undefined
): string {
  const count = intervalCount || 1
  if (!interval) return ''
  if (count === 1) {
    if (interval === 'month') return '/month'
    if (interval === 'year') return '/year'
    if (interval === 'week') return '/week'
    if (interval === 'day') return '/day'
  }
  return `/${count} ${interval}${count === 1 ? '' : 's'}`
}

async function fetchStripePlanPricing(planId: 'basic' | 'pro'): Promise<PlatformPlanPricing> {
  const meta = PLATFORM_PLANS[planId]
  const priceId = getPlatformPriceId(planId)

  if (!priceId) {
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

  try {
    const price = await stripe.prices.retrieve(priceId)
    const unitAmount = price.unit_amount || 0
    const currency = price.currency || 'usd'
    const recurring = price.recurring
    const priceAmount = Math.round((unitAmount / 100) * 100) / 100
    const monthlyPrice = normalizeToMonthlyPrice(
      unitAmount,
      recurring?.interval,
      recurring?.interval_count
    )

    return {
      planId,
      label: meta.label,
      description: meta.description,
      monthlyPrice,
      priceAmount,
      priceDisplay: formatCurrencyAmount(priceAmount, currency),
      intervalLabel: intervalSuffix(recurring?.interval, recurring?.interval_count),
      currency,
      seatLimit: PLATFORM_SEAT_LIMITS[planId],
      stripePriceId: priceId,
    }
  } catch (error) {
    console.error(`Failed to load Stripe price for ${planId}:`, error)
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
      stripePriceId: priceId,
    }
  }
}

async function fetchPlatformPlanPricingUncached(): Promise<PlatformPlanPricing[]> {
  const [basic, pro] = await Promise.all([
    fetchStripePlanPricing('basic'),
    fetchStripePlanPricing('pro'),
  ])

  return [buildTrialPlanPricing(), basic, pro]
}

const getCachedPlatformPlanPricing = unstable_cache(
  fetchPlatformPlanPricingUncached,
  ['platform-plan-pricing'],
  { revalidate: 300 }
)

export async function getPlatformPlanPricing(): Promise<PlatformPlanPricing[]> {
  return getCachedPlatformPlanPricing()
}

export async function getPlatformMonthlyPriceMap(): Promise<
  Record<Exclude<PlatformPlanId, 'trial'>, number>
> {
  const plans = await getPlatformPlanPricing()
  const basic = plans.find((p) => p.planId === 'basic')
  const pro = plans.find((p) => p.planId === 'pro')
  return {
    basic: basic?.monthlyPrice || 0,
    pro: pro?.monthlyPrice || 0,
  }
}