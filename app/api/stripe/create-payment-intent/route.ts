import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { stripe } from '@/lib/stripe'
import { fetchJobBillingTotals } from '@/lib/billing-server'
import { getCompanyStripeStatus } from '@/lib/stripe-connect'
import { assertJobAccess } from '@/lib/portal-auth'

export async function POST(request: Request) {
  try {
    const { scheduleId, clientId } = await request.json()

    if (!scheduleId || !clientId) {
      return NextResponse.json({ error: 'Missing scheduleId or clientId' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    const access = await assertJobAccess(scheduleId, clientId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.error === 'Unauthorized' ? 401 : 403 })
    }

    const billing = await fetchJobBillingTotals(scheduleId, clientId)
    if (!billing) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (billing.lineItemCount === 0) {
      return NextResponse.json({ error: 'Add line items before collecting payment' }, { status: 400 })
    }

    if (!billing.billable) {
      return NextResponse.json(
        { error: 'Payment is not available until your visit begins' },
        { status: 400 }
      )
    }

    if (billing.summary.balanceDue <= 0) {
      return NextResponse.json({ error: 'No balance due on this job' }, { status: 400 })
    }

    if (!billing.companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const stripeStatus = await getCompanyStripeStatus(billing.companyId)
    if (!stripeStatus.billingEnabled || !stripeStatus.stripeAccountId) {
      return NextResponse.json({ error: 'Stripe is not connected for this company' }, { status: 400 })
    }

    const amountCents = Math.round(billing.summary.balanceDue * 100)

    const { data: client } = await supabase
      .from('clients')
      .select('email, name')
      .eq('id', clientId)
      .single()

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          schedule_id: scheduleId,
          client_id: clientId,
          company_id: billing.companyId,
          stripe_account_id: stripeStatus.stripeAccountId,
          job_title: billing.jobTitle || '',
        },
        receipt_email: client?.email || undefined,
        description: `Payment for ${billing.jobTitle || 'job'}`,
      },
      { stripeAccount: stripeStatus.stripeAccountId }
    )

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      stripeAccountId: stripeStatus.stripeAccountId,
      amount: billing.summary.balanceDue,
    })
  } catch (error: any) {
    console.error('create-payment-intent error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create payment' }, { status: 500 })
  }
}