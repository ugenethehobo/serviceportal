export type PlatformPlanId = 'trial' | 'basic' | 'pro'

export const PLATFORM_TRIAL_DAYS = 14

export const PLATFORM_SEAT_LIMITS: Record<PlatformPlanId, number> = {
  trial: 10,
  basic: 10,
  pro: 30,
}

export type PlatformSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'

export const PLATFORM_PLANS: Record<
  PlatformPlanId,
  { label: string; monthlyPrice: number; description: string }
> = {
  trial: {
    label: 'Free Trial',
    monthlyPrice: 0,
    description: `Full access for ${PLATFORM_TRIAL_DAYS} days — no credit card required.`,
  },
  basic: {
    label: 'Basic',
    monthlyPrice: 49,
    description: `Scheduling, clients, billing, and up to ${PLATFORM_SEAT_LIMITS.basic} team seats.`,
  },
  pro: {
    label: 'Pro',
    monthlyPrice: 99,
    description: `Everything in Basic plus reports, integrations, and ${PLATFORM_SEAT_LIMITS.pro} team seats.`,
  },
}

export function getSeatLimitForPlan(plan: PlatformPlanId): number {
  return PLATFORM_SEAT_LIMITS[plan]
}

export function getTrialEndsAt(from = new Date()): string {
  const end = new Date(from)
  end.setUTCDate(end.getUTCDate() + PLATFORM_TRIAL_DAYS)
  return end.toISOString()
}

export function getPlatformPriceId(plan: Exclude<PlatformPlanId, 'trial'>): string | null {
  if (plan === 'basic') return process.env.STRIPE_PLATFORM_PRICE_BASIC || null
  return process.env.STRIPE_PLATFORM_PRICE_PRO || null
}

export function normalizePlatformPlan(value: string | null | undefined): PlatformPlanId {
  if (value === 'basic' || value === 'pro') return value
  return 'trial'
}

export function normalizeSubscriptionStatus(
  value: string | null | undefined
): PlatformSubscriptionStatus {
  if (
    value === 'active' ||
    value === 'past_due' ||
    value === 'canceled' ||
    value === 'unpaid' ||
    value === 'incomplete'
  ) {
    return value
  }
  return 'trialing'
}

export function getSubscriptionDisplayLabel(
  plan: PlatformPlanId,
  status: PlatformSubscriptionStatus,
  promoCode?: string | null
): string {
  if (status === 'canceled') return 'Canceled'
  if (plan === 'trial' && status === 'trialing') return 'Free Trial'
  const base = PLATFORM_PLANS[plan].label
  if (promoCode?.trim()) return `${base} (Promo)`
  return base
}

export function computePlatformMrr(
  companies: Array<{ subscription_plan?: string | null; subscription_status?: string | null }>
) {
  let mrr = 0
  let activeSubscriptions = 0

  for (const company of companies) {
    const plan = normalizePlatformPlan(company.subscription_plan)
    const status = normalizeSubscriptionStatus(company.subscription_status)
    if (status !== 'active' && status !== 'past_due') continue
    if (plan === 'trial') continue
    mrr += PLATFORM_PLANS[plan].monthlyPrice
    activeSubscriptions += 1
  }

  return { mrr, activeSubscriptions }
}

export function mapStripeSubscriptionToPlatform(
  stripeStatus: string,
  priceId: string | null | undefined
): { plan: PlatformPlanId; status: PlatformSubscriptionStatus } {
  let plan: PlatformPlanId = 'trial'
  if (priceId) {
    if (priceId === process.env.STRIPE_PLATFORM_PRICE_BASIC) plan = 'basic'
    if (priceId === process.env.STRIPE_PLATFORM_PRICE_PRO) plan = 'pro'
  }

  const status = normalizeSubscriptionStatus(
    stripeStatus === 'trialing'
      ? 'trialing'
      : stripeStatus === 'active'
        ? 'active'
        : stripeStatus === 'past_due'
          ? 'past_due'
          : stripeStatus === 'canceled'
            ? 'canceled'
            : stripeStatus === 'unpaid'
              ? 'unpaid'
              : 'incomplete'
  )

  return { plan, status }
}