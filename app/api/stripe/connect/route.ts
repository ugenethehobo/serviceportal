import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { assertCompanyAdminForStripe, createStripeConnectLink } from '@/lib/stripe-connect'

export async function POST(request: Request) {
  try {
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminCheck = await assertCompanyAdminForStripe(user.id)
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status })
    }

    const { companyId } = adminCheck

    const origin = new URL(request.url).origin
    let returnTo: 'settings' | 'onboarding' = 'settings'
    try {
      const body = await request.json()
      if (body?.returnTo === 'onboarding') {
        returnTo = 'onboarding'
      }
    } catch {
      // no body — default to settings
    }

    const { url } = await createStripeConnectLink(companyId, origin, returnTo)

    return NextResponse.json({ url })
  } catch (error: any) {
    console.error('stripe connect error:', error)
    return NextResponse.json({ error: error.message || 'Failed to start Stripe Connect' }, { status: 500 })
  }
}