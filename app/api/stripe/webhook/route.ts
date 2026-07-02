import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { recordStripePayment } from '@/lib/billing-server'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'account.updated') {
    const account = event.data.object
    const companyId = account.metadata?.company_id

    if (companyId) {
      const supabaseAdmin = createSupabaseAdmin()
      await supabaseAdmin
        .from('companies')
        .update({
          stripe_charges_enabled: account.charges_enabled ?? false,
          stripe_onboarding_complete: account.details_submitted ?? false,
        })
        .eq('id', companyId)
    }
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object
    const scheduleId = paymentIntent.metadata?.schedule_id
    const clientId = paymentIntent.metadata?.client_id
    const companyId = paymentIntent.metadata?.company_id

    if (scheduleId && clientId && companyId) {
      try {
        await recordStripePayment({
          scheduleId,
          clientId,
          companyId,
          amount: paymentIntent.amount_received / 100,
          paymentIntentId: paymentIntent.id,
        })
      } catch (error) {
        console.error('Failed to record Stripe payment:', error)
        return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ received: true })
}