import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?stripe_error=${error}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?stripe_error=invalid_request`)
  }

  // Extract userId from state (format: userId:random)
  const userId = state.split(':')[0]

  if (!userId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?stripe_error=invalid_state`)
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    })

    const connectedAccountId = response.stripe_user_id

    if (!connectedAccountId) {
      throw new Error('No Stripe account ID returned')
    }

    // Insert using service role (reliable)
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error: insertError } = await serviceSupabase
      .from('user_stripe_settings')
      .upsert({
        user_id: userId,
        stripe_account_id: connectedAccountId,
        updated_at: new Date().toISOString(),
      })

    if (insertError) throw insertError

    // Success
    const redirectResponse = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?stripe_connected=true`
    )
    redirectResponse.cookies.delete('stripe_oauth_state')

    return redirectResponse
  } catch (err) {
    console.error('Stripe Connect error:', err)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?stripe_error=connection_failed`)
  }
}
