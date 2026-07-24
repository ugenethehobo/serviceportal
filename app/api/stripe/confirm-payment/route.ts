import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { recordStripePayment } from '@/lib/billing-server'
import { LEDGER_OVERPAYMENT_CLIENT_MESSAGE } from '@/lib/billing-stripe'
import { assertJobAccess } from '@/lib/portal-auth'
import { getCompanyStripeStatus } from '@/lib/stripe-connect'

export async function POST(request: Request) {
  try {
    const { paymentIntentId, stripeAccountId } = await request.json()

    if (!paymentIntentId || !stripeAccountId) {
      return NextResponse.json(
        { error: 'Missing paymentIntentId or stripeAccountId' },
        { status: 400 }
      )
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
    const installmentId = paymentIntent.metadata?.installment_id || null

    if (!scheduleId || !clientId || !companyId) {
      return NextResponse.json({ error: 'Missing payment metadata' }, { status: 400 })
    }

    const stripeStatus = await getCompanyStripeStatus(companyId)
    if (!stripeStatus.stripeAccountId || stripeStatus.stripeAccountId !== stripeAccountId) {
      return NextResponse.json(
        { error: 'Invalid Stripe account for this company' },
        { status: 403 }
      )
    }

    const access = await assertJobAccess(scheduleId, clientId)
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.error === 'Unauthorized' ? 401 : 403 }
      )
    }
    if (access.mode === 'staff_preview') {
      return NextResponse.json(
        { error: 'Payments are disabled while previewing the client portal.' },
        { status: 403 }
      )
    }

    const result = await recordStripePayment({
      scheduleId,
      clientId,
      companyId,
      amount: paymentIntent.amount_received / 100,
      paymentIntentId: paymentIntent.id,
      installmentId,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          error: LEDGER_OVERPAYMENT_CLIENT_MESSAGE,
          code: result.code,
          amount: result.amount,
          balanceDue: result.balanceDue,
        },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true, duplicate: result.duplicate })
  } catch (error: any) {
    console.error('confirm-payment error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to confirm payment' },
      { status: 500 }
    )
  }
}
