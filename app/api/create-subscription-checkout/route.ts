import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { plan } = body // 'monthly' | 'annual'

    if (!plan || !['monthly', 'annual'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

    // Price IDs are configured in your Stripe dashboard
    // Add these to your .env.local
    const priceId =
      plan === 'monthly'
        ? process.env.STRIPE_PRICE_MONTHLY
        : process.env.STRIPE_PRICE_ANNUAL

    if (!priceId) {
      return NextResponse.json(
        { error: 'Stripe Price ID not configured for this plan. Please add STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL to your environment variables.' },
        { status: 500 }
      )
    }

    // Determine the correct base URL for Stripe redirects.
    // This logic is designed to work reliably in Production, Preview deployments, and local dev.
    //
    // Priority order:
    // 1. NEXT_PUBLIC_PUBLIC_URL  → explicit override (e.g. ngrok for local testing)
    // 2. VERCEL_URL              → the actual current deployment URL (best for Preview deploys)
    // 3. NEXT_PUBLIC_APP_URL     → your configured main URL
    // 4. localhost fallback
    const vercelUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : null;

    const publicBaseUrl = 
      process.env.NEXT_PUBLIC_PUBLIC_URL || 
      vercelUrl || 
      process.env.NEXT_PUBLIC_APP_URL || 
      'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      // Point to a fast, lightweight success page first.
      // This avoids long spinners after Stripe payment because the onboarding wizard is heavy.
      success_url: `${publicBaseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicBaseUrl}/pricing?canceled=true`,
      // We will collect the customer's email and create their account after successful payment
      allow_promotion_codes: true,
      metadata: {
        plan,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Subscription checkout error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal error creating checkout session' 
    }, { status: 500 })
  }
}
