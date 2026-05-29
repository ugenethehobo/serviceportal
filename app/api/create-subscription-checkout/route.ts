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
    // 
    // For Vercel deployments (Preview or Production), we strongly prefer VERCEL_URL.
    // This prevents the common problem of stale NEXT_PUBLIC_* URLs causing 404s on redirects.
    //
    // Priority (highest first):
    // 1. NEXT_PUBLIC_PUBLIC_URL  → only for local ngrok testing. Should be empty in Vercel.
    // 2. VERCEL_URL              → injected by Vercel for the current deployment (best for previews)
    // 3. NEXT_PUBLIC_APP_URL     → only really needed for Production custom domains
    // 4. localhost
    const vercelUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : null;

    let publicBaseUrl = 
      process.env.NEXT_PUBLIC_PUBLIC_URL || 
      vercelUrl || 
      process.env.NEXT_PUBLIC_APP_URL || 
      'http://localhost:3000';

    // Strong safety net for Vercel: If we're on Vercel and the resolved URL looks like
    // an old/stale value (ngrok, localhost, or a previous preview), prefer VERCEL_URL.
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

    console.log('[create-subscription-checkout] Using publicBaseUrl:', publicBaseUrl);

    const fullSuccessUrl = `${publicBaseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    console.log('[create-subscription-checkout] Full success_url sent to Stripe:', fullSuccessUrl);

    // Helpful log for debugging preview vs production issues
    if (process.env.VERCEL_ENV) {
      console.log(`[create-subscription-checkout] VERCEL_ENV=${process.env.VERCEL_ENV}, VERCEL_URL=${process.env.VERCEL_URL}`);
    }

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
