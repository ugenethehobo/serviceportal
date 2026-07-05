export type PlatformPlanId = 'trial' | 'basic' | 'pro'

export const PLATFORM_TRIAL_DAYS = 14

export const PLATFORM_SEAT_LIMITS: Record<PlatformPlanId, number> = {
  trial: 2,
  basic: 10,
  pro: 30,
}

export type PlatformSubscriptionStatus =
  | 'trialing'
  | 'trial_expired'
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
    description: `${PLATFORM_TRIAL_DAYS}-day trial with ${PLATFORM_SEAT_LIMITS.trial} seats, 2 crews, and core scheduling.`,
  },
  basic: {
    label: 'Basic',
    monthlyPrice: 49,
    description: `${PLATFORM_SEAT_LIMITS.basic} seats, 5 crews, reports, and client billing.`,
  },
  pro: {
    label: 'Pro',
    monthlyPrice: 99,
    description: `${PLATFORM_SEAT_LIMITS.pro} seats, unlimited crews, routes, reports, and integrations.`,
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
    value === 'incomplete' ||
    value === 'trial_expired'
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
  if (status === 'trial_expired') return 'Trial ended'
  if (plan === 'trial' && status === 'trialing') return 'Free Trial'
  const base = PLATFORM_PLANS[plan].label
  if (promoCode?.trim()) return `${base} (Promo)`
  return base
}

export function computePlatformMrr(
  companies: Array<{
    subscription_plan?: string | null
    subscription_status?: string | null
    promo_code?: string | null
  }>,
  monthlyPriceByPlan?: Partial<Record<Exclude<PlatformPlanId, 'trial'>, number>>
) {
  let mrr = 0
  let activeSubscriptions = 0

  for (const company of companies) {
    const plan = normalizePlatformPlan(company.subscription_plan)
    const status = normalizeSubscriptionStatus(company.subscription_status)
    if (status !== 'active' && status !== 'past_due') continue
    if (plan === 'trial') continue
    if (company.promo_code?.trim()) continue

    const monthlyPrice =
      monthlyPriceByPlan?.[plan] ?? PLATFORM_PLANS[plan].monthlyPrice
    mrr += monthlyPrice
    activeSubscriptions += 1
  }

  return { mrr: Math.round(mrr * 100) / 100, activeSubscriptions }
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