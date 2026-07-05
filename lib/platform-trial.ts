import {
  getTrialEndsAt,
  normalizePlatformPlan,
  normalizeSubscriptionStatus,
  PLATFORM_TRIAL_DAYS,
  type PlatformPlanId,
  type PlatformSubscriptionStatus,
} from '@/lib/platform-billing'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type CompanySubscriptionRecord = {
  subscription_plan?: string | null
  subscription_status?: string | null
  trial_ends_at?: string | null
  promo_code?: string | null
  created_at?: string | null
}

export type CompanySubscriptionAccess = {
  plan: PlatformPlanId
  status: PlatformSubscriptionStatus
  hasAccess: boolean
  isOnTrial: boolean
  isTrialExpired: boolean
  trialEndsAt: string | null
  daysRemaining: number | null
  trialLabel: string | null
}

export function resolveTrialEndsAt(
  company: CompanySubscriptionRecord,
  now = new Date()
): string | null {
  if (company.trial_ends_at) return company.trial_ends_at
  if (!company.created_at) return null
  return getTrialEndsAt(new Date(company.created_at))
}

export function getTrialDaysRemaining(trialEndsAt: string, now = new Date()): number {
  const ms = new Date(trialEndsAt).getTime() - now.getTime()
  if (ms <= 0) return 0
  return Math.ceil(ms / MS_PER_DAY)
}

export function formatTrialCountdown(daysRemaining: number): string {
  if (daysRemaining <= 0) return 'Trial ended'
  if (daysRemaining === 1) return '1 day left in your free trial'
  return `${daysRemaining} days left in your free trial`
}

export function evaluateCompanySubscriptionAccess(
  company: CompanySubscriptionRecord,
  now = new Date()
): CompanySubscriptionAccess {
  const plan = normalizePlatformPlan(company.subscription_plan)
  const status = normalizeSubscriptionStatus(company.subscription_status)
  const hasPromo = Boolean(company.promo_code?.trim())

  if (hasPromo) {
    return {
      plan,
      status,
      hasAccess: true,
      isOnTrial: false,
      isTrialExpired: false,
      trialEndsAt: null,
      daysRemaining: null,
      trialLabel: null,
    }
  }

  if (plan === 'basic' || plan === 'pro') {
    const hasAccess = status === 'active' || status === 'past_due'
    return {
      plan,
      status,
      hasAccess,
      isOnTrial: false,
      isTrialExpired: false,
      trialEndsAt: null,
      daysRemaining: null,
      trialLabel: null,
    }
  }

  const trialEndsAt = resolveTrialEndsAt(company, now)
  const daysRemaining = trialEndsAt ? getTrialDaysRemaining(trialEndsAt, now) : 0
  const isTrialExpired = !trialEndsAt || daysRemaining <= 0

  return {
    plan: 'trial',
    status: isTrialExpired ? 'trial_expired' : 'trialing',
    hasAccess: !isTrialExpired,
    isOnTrial: !isTrialExpired,
    isTrialExpired,
    trialEndsAt,
    daysRemaining: isTrialExpired ? 0 : daysRemaining,
    trialLabel: isTrialExpired
      ? 'Your free trial has ended'
      : formatTrialCountdown(daysRemaining),
  }
}

export function shouldBackfillTrialEndsAt(company: CompanySubscriptionRecord): boolean {
  const plan = normalizePlatformPlan(company.subscription_plan)
  return plan === 'trial' && !company.trial_ends_at && Boolean(company.created_at)
}

export { PLATFORM_TRIAL_DAYS }