import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { syncCompanyStripeAccount, getCompanyIdForUser } from '@/lib/stripe-connect'

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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = await getCompanyIdForUser(user.id)
    if (!companyId) {
      return NextResponse.json({ error: 'No company found' }, { status: 404 })
    }

    const status = await syncCompanyStripeAccount(companyId)
    return NextResponse.json(status)
  } catch (error: any) {
    console.error('stripe connect refresh error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}