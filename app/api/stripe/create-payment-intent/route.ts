import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { stripe } from '@/lib/stripe'
import { fetchJobBillingTotals } from '@/lib/billing-server'
import {
  paymentIntentIdempotencyKey,
  resolvePaymentIntentAmount,
} from '@/lib/billing-stripe'
import { getCompanyStripeStatus } from '@/lib/stripe-connect'
import { assertJobAccess } from '@/lib/portal-auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const scheduleId = body.scheduleId as string | undefined
    const clientId = body.clientId as string | undefined
    const requestedAmount =
      body.amount !== undefined && body.amount !== null ? Number(body.amount) : null
    const installmentId =
      typeof body.installmentId === 'string' && body.installmentId
        ? body.installmentId
        : null

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

    const billing = await fetchJobBillingTotals(scheduleId, clientId)
    if (!billing) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const resolved = resolvePaymentIntentAmount({
      requestedAmount,
      amountDueNow: billing.amountDueNow,
      maxPayableNow: billing.maxPayableNow,
      balanceDue: billing.summary.balanceDue,
      canPay: billing.canPay,
      lineItemCount: billing.lineItemCount,
    })

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    if (!billing.companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const stripeStatus = await getCompanyStripeStatus(billing.companyId)
    if (!stripeStatus.billingEnabled || !stripeStatus.stripeAccountId) {
      return NextResponse.json(
        { error: 'Stripe is not connected for this company' },
        { status: 400 }
      )
    }

    // Optional: validate installment belongs to this schedule when table exists
    if (installmentId) {
      const { data: inst, error: instError } = await supabase
        .from('billing_installments')
        .select('id, schedule_id, status')
        .eq('id', installmentId)
        .maybeSingle()

      // Ignore missing table (migration not applied); reject bad id when table exists
      if (!instError) {
        if (!inst || inst.schedule_id !== scheduleId || inst.status === 'superseded') {
          return NextResponse.json({ error: 'Invalid installment' }, { status: 400 })
        }
      }
    }

    const amountCents = Math.round(resolved.amount * 100)

    const { data: client } = await supabase
      .from('clients')
      .select('email, name')
      .eq('id', clientId)
      .single()

    const metadata: Record<string, string> = {
      schedule_id: scheduleId,
      client_id: clientId,
      company_id: billing.companyId,
      stripe_account_id: stripeStatus.stripeAccountId,
      job_title: billing.jobTitle || '',
      amount_dollars: String(resolved.amount),
    }
    if (installmentId) {
      metadata.installment_id = installmentId
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata,
        receipt_email: client?.email || undefined,
        description: `Payment for ${billing.jobTitle || 'job'}`,
      },
      {
        stripeAccount: stripeStatus.stripeAccountId,
        idempotencyKey: paymentIntentIdempotencyKey({
          scheduleId,
          amountCents,
          installmentId,
        }),
      }
    )

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      stripeAccountId: stripeStatus.stripeAccountId,
      amount: resolved.amount,
      amountDueNow: billing.amountDueNow,
      maxPayableNow: billing.maxPayableNow,
      balanceDue: billing.summary.balanceDue,
    })
  } catch (error: any) {
    console.error('create-payment-intent error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create payment' },
      { status: 500 }
    )
  }
}
