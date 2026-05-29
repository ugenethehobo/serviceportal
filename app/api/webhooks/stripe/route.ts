import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

// Service role client for reliable webhook processing
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Safely cast Stripe objects coming from webhooks or API responses.
 *
 * Stripe's TypeScript definitions frequently return `Response<T>` wrappers
 * that don't expose all properties cleanly (especially under Turbopack on Vercel).
 * This helper centralizes the pragmatic `as any` workaround so we can
 * easily find and update these casts later.
 */
const asStripe = <T>(obj: any): T => obj as T;

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    console.error('Missing stripe-signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err: any) {
    console.error('⚠️ Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotency check - prevent duplicate processing
  try {
    const { data: existingEvent } = await supabaseAdmin
      .from('stripe_webhook_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .single()

    if (existingEvent) {
      console.log(`Event ${event.id} already processed. Skipping.`)
      return NextResponse.json({ received: true, duplicate: true })
    }

    // Record that we're processing this event
    await supabaseAdmin.from('stripe_webhook_events').insert({
      stripe_event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString(),
    })
  } catch (e) {
    // If the stripe_webhook_events table doesn't exist yet, continue without idempotency
    console.warn('Could not perform idempotency check (table may not exist)')
  }

  // Process the event
  try {
    switch (event.type) {
      // ============================================
      // Subscription Checkout Completed
      // ============================================
      case 'checkout.session.completed': {
        const session = asStripe<Stripe.Checkout.Session>(event.data.object)

        if (session.mode === 'subscription' && session.customer) {
          console.log('✅ Processing subscription checkout completed:', event.id)

          const customerId = typeof session.customer === 'string'
            ? session.customer
            : session.customer.id

          // Find the company by stripe_customer_id
          const { data: company } = await supabaseAdmin
            .from('companies')
            .select('id, subscription_status')
            .eq('stripe_customer_id', customerId)
            .single()

          if (company) {
            // Update company status
            await supabaseAdmin
              .from('companies')
              .update({
                subscription_status: 'active',
                onboarding_completed_at: new Date().toISOString(),
              })
              .eq('id', company.id)

            // Create or update subscription record
            if (session.subscription) {
              const stripeSub = asStripe<any>(
                await stripe.subscriptions.retrieve(session.subscription as string)
              );

              await supabaseAdmin
                .from('subscriptions')
                .upsert({
                  company_id: company.id,
                  stripe_subscription_id: stripeSub.id,
                  status: stripeSub.status,
                  plan: stripeSub.items.data[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly',
                  current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
                  amount: stripeSub.items.data[0]?.price?.unit_amount || 0,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'stripe_subscription_id' })
            }
          }
        }
        break
      }

      // ============================================
      // Subscription Created / Updated
      // ============================================
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = asStripe<any>(event.data.object)
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id

        console.log(`✅ Processing ${event.type}:`, event.id)

        // Find company by stripe customer id
        const { data: company } = await supabaseAdmin
          .from('companies')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (company) {
          // Update company status
          await supabaseAdmin
            .from('companies')
            .update({ subscription_status: subscription.status })
            .eq('id', company.id)

          // Upsert subscription record
          await supabaseAdmin
            .from('subscriptions')
            .upsert({
              company_id: company.id,
              stripe_subscription_id: subscription.id,
              status: subscription.status,
              plan: subscription.items.data[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly',
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              amount: subscription.items.data[0]?.price?.unit_amount || 0,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'stripe_subscription_id' })
        }
        break
      }

      // ============================================
      // Subscription Canceled / Deleted
      // ============================================
      case 'customer.subscription.deleted': {
        const subscription = asStripe<any>(event.data.object)
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id

        console.log('⚠️ Processing subscription cancellation:', event.id)

        const { data: company } = await supabaseAdmin
          .from('companies')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (company) {
          await supabaseAdmin
            .from('companies')
            .update({ subscription_status: 'canceled' })
            .eq('id', company.id)

          await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'canceled',
              updated_at: new Date().toISOString()
            })
            .eq('stripe_subscription_id', subscription.id)
        }
        break
      }

      // ============================================
      // Payment Failed
      // ============================================
      case 'invoice.payment_failed': {
        const invoice = asStripe<any>(event.data.object)
        if (invoice.subscription && invoice.customer) {
          const customerId = typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer.id

          console.log('❌ Processing payment failure:', event.id)

          const { data: company } = await supabaseAdmin
            .from('companies')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single()

          if (company) {
            await supabaseAdmin
              .from('companies')
              .update({ subscription_status: 'past_due' })
              .eq('id', company.id)

            await supabaseAdmin
              .from('subscriptions')
              .update({ status: 'past_due' })
              .eq('stripe_subscription_id', invoice.subscription)
          }
        }
        break
      }

      // ============================================
      // Payment Succeeded
      // ============================================
      case 'invoice.payment_succeeded': {
        const invoice = asStripe<any>(event.data.object)
        if (invoice.subscription && invoice.customer) {
          const customerId = typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer.id

          const { data: company } = await supabaseAdmin
            .from('companies')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single()

          if (company) {
            await supabaseAdmin
              .from('companies')
              .update({ subscription_status: 'active' })
              .eq('id', company.id)

            await supabaseAdmin
              .from('subscriptions')
              .update({ status: 'active' })
              .eq('stripe_subscription_id', invoice.subscription)
          }
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Error processing webhook event:', error)

    // For critical events, we may want Stripe to retry.
    // Return 500 for important subscription events.
    const criticalEvents = [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted'
    ]

    if (criticalEvents.includes(event.type)) {
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }

    // For less critical events, acknowledge to avoid excessive retries
    return NextResponse.json({ received: true, error: 'Non-critical event processing failed' })
  }
}
