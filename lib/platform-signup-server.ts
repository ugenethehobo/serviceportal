import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import {
  getPlatformPriceId,
  getSeatLimitForPlan,
  getTrialEndsAt,
  mapStripeSubscriptionToPlatform,
  type PlatformPlanId,
} from '@/lib/platform-billing'
import { validatePlatformDevPromoCode } from '@/lib/platform-promo'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function createEmbeddedSignupCheckout(plan: 'basic' | 'pro', origin: string) {
  const priceId = getPlatformPriceId(plan)
  if (!priceId) {
    throw new Error('Platform billing is not configured. Set STRIPE_PLATFORM_PRICE_BASIC/PRO.')
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    ui_mode: 'embedded',
    line_items: [{ price: priceId, quantity: 1 }],
    return_url: `${origin}/signup?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    metadata: { signup: 'true', plan },
    subscription_data: {
      metadata: { signup: 'true', plan },
    },
  })

  if (!session.client_secret) {
    throw new Error('Could not create embedded checkout session')
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { error } = await supabaseAdmin.from('platform_signup_checkouts').upsert(
    {
      stripe_checkout_session_id: session.id,
      plan,
      status: 'pending',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_checkout_session_id' }
  )

  if (error?.code !== '42P01' && error) {
    console.error('platform_signup_checkouts insert error:', error)
  }

  return {
    clientSecret: session.client_secret,
    sessionId: session.id,
  }
}

export async function markSignupCheckoutPaid(input: {
  sessionId: string
  customerId: string | null
  subscriptionId: string | null
  plan: 'basic' | 'pro'
}) {
  const supabaseAdmin = createSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('platform_signup_checkouts')
    .update({
      status: 'paid',
      stripe_customer_id: input.customerId,
      stripe_subscription_id: input.subscriptionId,
      plan: input.plan,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_checkout_session_id', input.sessionId)
    .neq('status', 'claimed')

  if (error?.code === '42P01') return
  if (error) console.error('markSignupCheckoutPaid error:', error)
}

async function loadPaidSignupCheckout(sessionId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: row, error } = await supabaseAdmin
    .from('platform_signup_checkouts')
    .select('*')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle()

  if (error?.code === '42P01') {
    return verifySignupCheckoutFromStripe(sessionId)
  }
  if (error) throw error

  if (row?.status === 'claimed') {
    throw new Error('This checkout has already been used to create an account')
  }

  if (row?.status === 'paid') {
    return {
      plan: row.plan as 'basic' | 'pro',
      customerId: row.stripe_customer_id as string | null,
      subscriptionId: row.stripe_subscription_id as string | null,
    }
  }

  return verifySignupCheckoutFromStripe(sessionId)
}

async function verifySignupCheckoutFromStripe(sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  })

  if (session.metadata?.signup !== 'true') {
    throw new Error('Invalid checkout session')
  }

  if (session.status !== 'complete' && session.payment_status !== 'paid') {
    throw new Error('Checkout is not complete yet. Finish payment before creating your account.')
  }

  const plan = session.metadata.plan
  if (plan !== 'basic' && plan !== 'pro') {
    throw new Error('Invalid plan on checkout session')
  }

  const subscription =
    typeof session.subscription === 'string'
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription

  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id || null

  await markSignupCheckoutPaid({
    sessionId,
    customerId,
    subscriptionId: subscription?.id || null,
    plan,
  })

  return {
    plan,
    customerId,
    subscriptionId: subscription?.id || null,
  }
}

export async function completePlatformSignup(input: {
  plan: PlatformPlanId
  companyName: string
  fullName: string
  email: string
  password: string
  checkoutSessionId?: string
  promoCode?: string
}) {
  const companyName = input.companyName.trim()
  const fullName = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  const password = input.password

  if (!companyName) throw new Error('Company name is required')
  if (!fullName) throw new Error('Your name is required')
  if (!email || !email.includes('@')) throw new Error('Enter a valid email address')
  if (password.length < 8) throw new Error('Password must be at least 8 characters')

  const supabaseAdmin = createSupabaseAdmin()

  let stripeCustomerId: string | null = null
  let stripeSubscriptionId: string | null = null
  let subscriptionPlan: PlatformPlanId = input.plan
  let subscriptionStatus: string = input.plan === 'trial' ? 'trialing' : 'active'
  let trialEndsAt: string | null = input.plan === 'trial' ? getTrialEndsAt() : null
  let appliedPromoCode: string | null = null

  if (input.plan === 'basic' || input.plan === 'pro') {
    const promo = input.promoCode
      ? validatePlatformDevPromoCode(input.promoCode, input.plan)
      : null

    if (promo) {
      subscriptionPlan = input.plan
      subscriptionStatus = 'active'
      appliedPromoCode = promo.code
    } else {
      if (!input.checkoutSessionId) {
        throw new Error('Complete payment or apply a valid promo code before creating your account')
      }
      const checkout = await loadPaidSignupCheckout(input.checkoutSessionId)
      subscriptionPlan = checkout.plan as PlatformPlanId
      stripeCustomerId = checkout.customerId
      stripeSubscriptionId = checkout.subscriptionId

      if (stripeSubscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
        const priceId = subscription.items.data[0]?.price?.id
        const mapped = mapStripeSubscriptionToPlatform(subscription.status, priceId)
        subscriptionPlan =
          mapped.plan === 'trial' ? (checkout.plan as PlatformPlanId) : mapped.plan
        subscriptionStatus = mapped.status
      }
    }
  }

  const seatLimit = getSeatLimitForPlan(subscriptionPlan)

  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .insert({
      name: companyName,
      subscription_plan: subscriptionPlan,
      subscription_status: subscriptionStatus,
      seat_limit: seatLimit,
      trial_ends_at: trialEndsAt,
      stripe_platform_customer_id: stripeCustomerId,
      stripe_platform_subscription_id: stripeSubscriptionId,
      promo_code: appliedPromoCode,
      status: 'Active',
      onboarding_completed: false,
    })
    .select('id')
    .single()

  if (companyError) throw new Error(companyError.message || 'Could not create company')

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: 'company_admin',
      company_id: company.id,
    },
  })

  if (authError) {
    await supabaseAdmin.from('companies').delete().eq('id', company.id)
    throw new Error(authError.message || 'Could not create user account')
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: authData.user!.id,
    full_name: fullName,
    email,
    company_id: company.id,
    status: 'Active',
    role: 'company_admin',
  })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user!.id)
    await supabaseAdmin.from('companies').delete().eq('id', company.id)
    throw new Error(profileError.message || 'Could not create user profile')
  }

  if (input.checkoutSessionId) {
    await supabaseAdmin
      .from('platform_signup_checkouts')
      .update({
        status: 'claimed',
        company_id: company.id,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_checkout_session_id', input.checkoutSessionId)
  }

  if (stripeCustomerId) {
    await stripe.customers.update(stripeCustomerId, {
      name: companyName,
      email,
      metadata: { company_id: company.id, signup: 'true' },
    })
  }

  if (stripeSubscriptionId) {
    await stripe.subscriptions.update(stripeSubscriptionId, {
      metadata: { company_id: company.id, plan: subscriptionPlan },
    })
  }

  return { companyId: company.id, userId: authData.user!.id, email }
}

export async function countCompanySeats(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('role', ['company_admin', 'team_member'])

  if (error) throw error
  return count || 0
}