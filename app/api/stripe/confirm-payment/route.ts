import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { recordStripePayment } from '@/lib/billing-server'

export async function POST(request: Request) {
  try {
    const { paymentIntentId, stripeAccountId } = await request.json()

    if (!paymentIntentId || !stripeAccountId) {
      return NextResponse.json({ error: 'Missing paymentIntentId or stripeAccountId' }, { status: 400 })
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      stripeAccount: stripeAccountId,
    })

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
    }

    const scheduleId = paymentIntent.metadata?.schedule_id
    const clientId = paymentIntent.metadata?.client_id
    const companyId = paymentIntent.metadata?.company_id

    if (!scheduleId || !clientId || !companyId) {
      return NextResponse.json({ error: 'Missing payment metadata' }, { status: 400 })
    }

    await recordStripePayment({
      scheduleId,
      clientId,
      companyId,
      amount: paymentIntent.amount_received / 100,
      paymentIntentId: paymentIntent.id,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('confirm-payment error:', error)
    return NextResponse.json({ error: error.message || 'Failed to confirm payment' }, { status: 500 })
  }
}