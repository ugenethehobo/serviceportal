import { unstable_cache } from 'next/cache'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import {
  getPlatformPriceId,
  PLATFORM_PLANS,
  PLATFORM_SEAT_LIMITS,
  type BillingInterval,
  type PlatformPlanId,
} from '@/lib/platform-billing'
import {
  buildTrialPlanPricing,
  type PlatformPlanPriceOption,
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

async function fetchStripePriceOption(
  planId: 'basic' | 'pro',
  billingInterval: BillingInterval
): Promise<PlatformPlanPriceOption | null> {
  const priceId = getPlatformPriceId(planId, billingInterval)
  if (!priceId) return null

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
      interval: billingInterval,
      monthlyPrice,
      priceAmount,
      priceDisplay: formatCurrencyAmount(priceAmount, currency),
      intervalLabel: intervalSuffix(recurring?.interval, recurring?.interval_count),
      currency,
      stripePriceId: priceId,
    }
  } catch (error) {
    console.error(`Failed to load Stripe ${billingInterval} price for ${planId}:`, error)
    return {
      interval: billingInterval,
      monthlyPrice: 0,
      priceAmount: 0,
      priceDisplay: '—',
      intervalLabel: billingInterval === 'year' ? '/year' : '/month',
      currency: 'usd',
      stripePriceId: priceId,
    }
  }
}

async function fetchStripePlanPricing(planId: 'basic' | 'pro'): Promise<PlatformPlanPricing> {
  const meta = PLATFORM_PLANS[planId]
  const [monthly, annual] = await Promise.all([
    fetchStripePriceOption(planId, 'month'),
    fetchStripePriceOption(planId, 'year'),
  ])

  const priceOptions = [monthly, annual].filter(
    (option): option is PlatformPlanPriceOption => option !== null
  )

  if (priceOptions.length === 0) {
    return {
      planId,
      label: meta.label,
      description: meta.description,
      seatLimit: PLATFORM_SEAT_LIMITS[planId],
      priceOptions: [
        {
          interval: 'month',
          monthlyPrice: 0,
          priceAmount: 0,
          priceDisplay: '—',
          intervalLabel: '',
          currency: 'usd',
          stripePriceId: null,
        },
      ],
    }
  }

  return {
    planId,
    label: meta.label,
    description: meta.description,
    seatLimit: PLATFORM_SEAT_LIMITS[planId],
    priceOptions,
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
  ['platform-plan-pricing-v2'],
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
  const basicMonthly = basic?.priceOptions.find((option) => option.interval === 'month')
  const proMonthly = pro?.priceOptions.find((option) => option.interval === 'month')
  return {
    basic: basicMonthly?.monthlyPrice || 0,
    pro: proMonthly?.monthlyPrice || 0,
  }
}