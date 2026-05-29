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

    // Allow overriding the public base URL for testing (e.g. via ngrok)
    // Set NEXT_PUBLIC_PUBLIC_URL in .env.local when you want Stripe redirects
    // to go through a public tunnel while developing on localhost.
    const publicBaseUrl = 
      process.env.NEXT_PUBLIC_PUBLIC_URL || 
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
