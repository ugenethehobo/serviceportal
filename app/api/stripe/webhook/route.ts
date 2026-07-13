import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleStripeRefund, recordStripePayment } from '@/lib/billing-server'
import {
  isDuplicateStripeWebhookEvent,
  parseStripeWebhookRequest,
  recordStripeWebhookEvent,
} from '@/lib/stripe-webhook'

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
  const parsed = parseStripeWebhookRequest(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  )

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }

  const supabaseAdmin = createSupabaseAdmin()

  if (await isDuplicateStripeWebhookEvent(supabaseAdmin, parsed.event.id)) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    const event = parsed.event

    if (event.type === 'account.updated') {
      const account = event.data.object
      const companyId = account.metadata?.company_id

      if (companyId) {
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
        await recordStripePayment({
          scheduleId,
          clientId,
          companyId,
          amount: paymentIntent.amount_received / 100,
          paymentIntentId: paymentIntent.id,
        })
      }
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object
      const paymentIntentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id

      if (paymentIntentId) {
        await handleStripeRefund(paymentIntentId, charge.amount_refunded / 100)
      }
    }

    if (event.type === 'account.application.deauthorized') {
      const account = event.data.object
      await supabaseAdmin
        .from('companies')
        .update({
          stripe_account_id: null,
          stripe_charges_enabled: false,
          stripe_onboarding_complete: false,
        })
        .eq('stripe_account_id', account.id)
    }

    await recordStripeWebhookEvent(supabaseAdmin, event, 'connect')
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe Connect webhook handler failed:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}