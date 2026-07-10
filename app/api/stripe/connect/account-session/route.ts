import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  assertCompanyAdminForStripe,
  createStripeConnectAccountSession,
} from '@/lib/stripe-connect'

export async function POST() {
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

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminCheck = await assertCompanyAdminForStripe(user.id)
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status })
    }

    const { clientSecret } = await createStripeConnectAccountSession(adminCheck.companyId)

    return NextResponse.json({ clientSecret })
  } catch (error: unknown) {
    console.error('stripe connect account-session error:', error)
    const message = error instanceof Error ? error.message : 'Failed to start Stripe onboarding'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}