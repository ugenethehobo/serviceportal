import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { billIds, jobId, clientEmail, portalToken } = body

    if (!billIds || billIds.length === 0) {
      return NextResponse.json({ error: 'No bills provided' }, { status: 400 })
    }

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Get the user who owns this job (to find their connected Stripe account)
    const { data: job } = await supabase
      .from('jobs')
      .select('user_id')
      .eq('id', jobId)
      .single()

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Get the connected Stripe account for this user
    const { data: stripeSettings } = await supabase
      .from('user_stripe_settings')
      .select('stripe_account_id')
      .eq('user_id', job.user_id)
      .single()

    if (!stripeSettings?.stripe_account_id) {
      return NextResponse.json({
        error: 'This company has not connected their Stripe account yet.'
      }, { status: 400 })
    }

    // Initialize Stripe with platform key
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

    // Same robust base URL logic as the subscription checkout
    const vercelUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : null;

    let publicBaseUrl = 
      process.env.NEXT_PUBLIC_PUBLIC_URL || 
      vercelUrl || 
      process.env.NEXT_PUBLIC_APP_URL || 
      'http://localhost:3000';

    // Strong safety net for Vercel deployments
    const isOnVercel = !!process.env.VERCEL_ENV;
    const looksStale = 
      publicBaseUrl.includes('ngrok') || 
      publicBaseUrl.includes('localhost') ||
      (isOnVercel && !publicBaseUrl.includes(process.env.VERCEL_URL || ''));

    if (isOnVercel && looksStale && vercelUrl) {
      console.warn(
        `⚠️ Resolved publicBaseUrl looks stale ("${publicBaseUrl}"). ` +
        `Falling back to current Vercel deployment URL.`
      );
      publicBaseUrl = vercelUrl;
    }

    console.log('[create-checkout] Using publicBaseUrl:', publicBaseUrl);

    // Fetch the bills
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('*')
      .in('id', billIds)

    if (billsError || !bills || bills.length === 0) {
      return NextResponse.json({ error: 'Bills not found' }, { status: 404 })
    }

    // Create Checkout Session on behalf of the connected account
    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ['card'],
        line_items: bills.map((bill) => ({
          price_data: {
            currency: 'usd',
            product_data: {
              name: bill.name,
              description: bill.notes || undefined,
            },
            unit_amount: Math.round(Number(bill.amount) * 100),
          },
          quantity: 1,
        })),
        mode: 'payment',
        // Use the same robust URL logic as the subscription checkout
        success_url: portalToken
          ? `${publicBaseUrl}/portal/${portalToken}?payment=success&session_id={CHECKOUT_SESSION_ID}`
          : `${publicBaseUrl}/portal/success`,
        cancel_url: portalToken
          ? `${publicBaseUrl}/portal/${portalToken}?payment=cancelled`
          : `${publicBaseUrl}/portal/cancel`,
        customer_email: clientEmail,
        metadata: {
          billIds: billIds.join(','),
          jobId: jobId,
          portalToken: portalToken || '',
        },
      },
      {
        stripeAccount: stripeSettings.stripe_account_id, // ← Charges go to the company's account
      }
    )

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
