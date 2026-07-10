import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { stripe } from '@/lib/stripe'
import {
  mapStripeSubscriptionToPlatform,
  normalizePlatformPlan,
  normalizeSubscriptionStatus,
  PLATFORM_PLANS,
  type BillingInterval,
  type PlatformPlanId,
  type PlatformSubscriptionStatus,
} from '@/lib/platform-billing'
import { isDevCompedCompany, maskPromoCode, promoAppliedLabel } from '@/lib/platform-promo'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type PlatformSubscriptionBillingSource = 'trial' | 'stripe' | 'promo'

export type PlatformSubscriptionDetails = {
  plan: PlatformPlanId
  status: PlatformSubscriptionStatus
  billingSource: PlatformSubscriptionBillingSource
  planLabel: string
  statusLabel: string
  promoCodeMasked: string | null
  promoApplied: boolean
  hasStripeCustomer: boolean
  stripeSubscriptionId: string | null
  currentPeriodEnd: string | null
  currentPeriodStart: string | null
  billingInterval: BillingInterval | null
  priceLabel: string | null
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  isPaused: boolean
  pauseResumesAt: string | null
  canManageBilling: boolean
  canPause: boolean
  canCancel: boolean
  canResume: boolean
}

export type PlatformSubscriptionAction = 'cancel' | 'resume' | 'pause' | 'unpause'

function formatStripeTimestamp(value: number | null | undefined): string | null {
  if (!value) return null
  return new Date(value * 1000).toISOString()
}

function formatPriceLabel(subscription: Stripe.Subscription): string | null {
  const item = subscription.items.data[0]
  const unitAmount = item?.price?.unit_amount
  const currency = item?.price?.currency || 'usd'
  if (unitAmount == null) return null

  const amount = unitAmount / 100
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)

  const interval = item?.price?.recurring?.interval
  const count = item?.price?.recurring?.interval_count || 1
  if (!interval) return formatted
  if (count === 1 && interval === 'month') return `${formatted}/month`
  if (count === 1 && interval === 'year') return `${formatted}/year`
  return `${formatted} every ${count} ${interval}${count === 1 ? '' : 's'}`
}

function resolveBillingInterval(subscription: Stripe.Subscription): BillingInterval | null {
  const interval = subscription.items.data[0]?.price?.recurring?.interval
  if (interval === 'year') return 'year'
  if (interval === 'month') return 'month'
  return null
}

function getStatusLabel(
  plan: PlatformPlanId,
  status: PlatformSubscriptionStatus,
  promoApplied: boolean,
  cancelAtPeriodEnd: boolean,
  isPaused: boolean
): string {
  if (promoApplied) return promoAppliedLabel()
  if (isPaused) return 'Billing paused'
  if (cancelAtPeriodEnd) return 'Canceling at period end'
  if (status === 'past_due') return 'Payment past due'
  if (status === 'canceled') return 'Canceled'
  if (status === 'trial_expired') return 'Trial ended'
  if (plan === 'trial' && status === 'trialing') return 'Free trial'
  if (status === 'active') return 'Active'
  return status
}

export async function getStaffCompanyAdminId(): Promise<string | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id || profile.role !== 'company_admin') return null
  return profile.company_id as string
}

export async function getCompanyPlatformSubscriptionDetails(
  companyId: string
): Promise<PlatformSubscriptionDetails | null> {
  const admin = createSupabaseAdmin()
  const { data: company, error } = await admin
    .from('companies')
    .select(
      'subscription_plan, subscription_status, promo_code, stripe_platform_customer_id, stripe_platform_subscription_id'
    )
    .eq('id', companyId)
    .single()

  if (error || !company) return null

  const plan = normalizePlatformPlan(company.subscription_plan)
  const status = normalizeSubscriptionStatus(company.subscription_status)
  const promoApplied = isDevCompedCompany(company)
  const promoCodeMasked = promoApplied ? maskPromoCode(company.promo_code) : null

  if (promoApplied && (plan === 'basic' || plan === 'pro')) {
    return {
      plan,
      status,
      billingSource: 'promo',
      planLabel: PLATFORM_PLANS[plan].label,
      statusLabel: getStatusLabel(plan, status, true, false, false),
      promoCodeMasked,
      promoApplied: true,
      hasStripeCustomer: Boolean(company.stripe_platform_customer_id),
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      currentPeriodStart: null,
      billingInterval: null,
      priceLabel: 'Complimentary (dev code)',
      cancelAtPeriodEnd: false,
      canceledAt: null,
      isPaused: false,
      pauseResumesAt: null,
      canManageBilling: false,
      canPause: false,
      canCancel: false,
      canResume: false,
    }
  }

  if (plan === 'trial' || !company.stripe_platform_subscription_id) {
    return {
      plan,
      status,
      billingSource: 'trial',
      planLabel: PLATFORM_PLANS[plan].label,
      statusLabel: getStatusLabel(plan, status, false, false, false),
      promoCodeMasked: null,
      promoApplied: false,
      hasStripeCustomer: Boolean(company.stripe_platform_customer_id),
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      currentPeriodStart: null,
      billingInterval: null,
      priceLabel: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      isPaused: false,
      pauseResumesAt: null,
      canManageBilling: Boolean(company.stripe_platform_customer_id),
      canPause: false,
      canCancel: false,
      canResume: false,
    }
  }

  const subscription = await stripe.subscriptions.retrieve(company.stripe_platform_subscription_id)
  const priceId = subscription.items.data[0]?.price?.id
  const mapped = mapStripeSubscriptionToPlatform(subscription.status, priceId)
  const cancelAtPeriodEnd = subscription.cancel_at_period_end ?? false
  const isPaused = Boolean(subscription.pause_collection)
  const pauseResumesAt = formatStripeTimestamp(subscription.pause_collection?.resumes_at)
  const resolvedPlan = mapped.plan === 'trial' ? plan : mapped.plan
  const resolvedStatus = mapped.status

  const canManage =
    resolvedStatus === 'active' || resolvedStatus === 'past_due' || cancelAtPeriodEnd || isPaused

  return {
    plan: resolvedPlan,
    status: resolvedStatus,
    billingSource: 'stripe',
    planLabel: PLATFORM_PLANS[resolvedPlan].label,
    statusLabel: getStatusLabel(resolvedPlan, resolvedStatus, false, cancelAtPeriodEnd, isPaused),
    promoCodeMasked: null,
    promoApplied: false,
    hasStripeCustomer: Boolean(company.stripe_platform_customer_id),
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: formatStripeTimestamp(subscription.current_period_end),
    currentPeriodStart: formatStripeTimestamp(subscription.current_period_start),
    billingInterval: resolveBillingInterval(subscription),
    priceLabel: formatPriceLabel(subscription),
    cancelAtPeriodEnd,
    canceledAt: formatStripeTimestamp(subscription.canceled_at),
    isPaused,
    pauseResumesAt,
    canManageBilling: canManage,
    canPause: canManage && !isPaused && !cancelAtPeriodEnd,
    canCancel: canManage && !cancelAtPeriodEnd,
    canResume: canManage && (cancelAtPeriodEnd || isPaused),
  }
}

export async function performPlatformSubscriptionAction(
  companyId: string,
  action: PlatformSubscriptionAction
): Promise<{ success: true; details: PlatformSubscriptionDetails } | { success: false; error: string }> {
  const admin = createSupabaseAdmin()
  const { data: company, error } = await admin
    .from('companies')
    .select(
      'promo_code, stripe_platform_subscription_id, subscription_plan, subscription_status'
    )
    .eq('id', companyId)
    .single()

  if (error || !company) {
    return { success: false, error: 'Company not found' }
  }

  if (isDevCompedCompany(company)) {
    return {
      success: false,
      error: 'This account uses a developer promo code and is not billed through Stripe.',
    }
  }

  const subscriptionId = company.stripe_platform_subscription_id
  if (!subscriptionId) {
    return { success: false, error: 'No active Stripe subscription found' }
  }

  try {
    switch (action) {
      case 'cancel':
        await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
        break
      case 'resume':
        await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: false,
          pause_collection: '',
        })
        break
      case 'pause':
        await stripe.subscriptions.update(subscriptionId, {
          pause_collection: { behavior: 'void' },
        })
        break
      case 'unpause':
        await stripe.subscriptions.update(subscriptionId, {
          pause_collection: '',
        })
        break
      default:
        return { success: false, error: 'Invalid action' }
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const priceId = subscription.items.data[0]?.price?.id
    const { plan, status } = mapStripeSubscriptionToPlatform(subscription.status, priceId)

    await admin
      .from('companies')
      .update({
        subscription_plan: plan === 'trial' ? company.subscription_plan : plan,
        subscription_status: status,
      })
      .eq('id', companyId)

    const details = await getCompanyPlatformSubscriptionDetails(companyId)
    if (!details) {
      return { success: false, error: 'Subscription updated but details could not be loaded' }
    }

    return { success: true, details }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Subscription update failed'
    return { success: false, error: message }
  }
}

export function formatSubscriptionDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}