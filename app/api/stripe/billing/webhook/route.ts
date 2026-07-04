import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { getSeatLimitForPlan, mapStripeSubscriptionToPlatform } from '@/lib/platform-billing'
import { markSignupCheckoutPaid } from '@/lib/platform-signup-server'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function syncCompanySubscription(subscription: {
  id: string
  customer: string | { id: string }
  status: string
  metadata?: { company_id?: string }
  items: { data: Array<{ price?: { id?: string } }> }
}) {
  const admin = createSupabaseAdmin()
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id
  const priceId = subscription.items.data[0]?.price?.id
  const { plan, status } = mapStripeSubscriptionToPlatform(subscription.status, priceId)

  let companyId = subscription.metadata?.company_id
  if (!companyId) {
    const { data: company } = await admin
      .from('companies')
      .select('id')
      .eq('stripe_platform_customer_id', customerId)
      .maybeSingle()
    companyId = company?.id
  }

  if (!companyId) {
    console.warn('Platform billing webhook: company not found for subscription', subscription.id)
    return
  }

  await admin
    .from('companies')
    .update({
      stripe_platform_subscription_id: subscription.id,
      stripe_platform_customer_id: customerId,
      subscription_plan: plan,
      subscription_status: status,
      seat_limit: getSeatLimitForPlan(plan),
    })
    .eq('id', companyId)
}

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  const secret =
    process.env.STRIPE_BILLING_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch (error: any) {
    console.error('Billing webhook signature failed:', error.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated'
  ) {
    await syncCompanySubscription(event.data.object)
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object
    const admin = createSupabaseAdmin()
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id

    await admin
      .from('companies')
      .update({
        subscription_plan: 'trial',
        subscription_status: 'canceled',
        stripe_platform_subscription_id: null,
      })
      .eq('stripe_platform_customer_id', customerId)
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object

    if (session.metadata?.signup === 'true') {
      const plan = session.metadata.plan
      if (plan === 'basic' || plan === 'pro') {
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id || null
        const customerId =
          typeof session.customer === 'string' ? session.customer : session.customer?.id || null

        await markSignupCheckoutPaid({
          sessionId: session.id,
          customerId,
          subscriptionId,
          plan,
        })
      }
      return NextResponse.json({ received: true })
    }

    if (session.mode === 'subscription' && session.subscription) {
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      await syncCompanySubscription(subscription)
    }
  }

  return NextResponse.json({ received: true })
}