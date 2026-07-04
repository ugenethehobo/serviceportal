import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { stripe } from '@/lib/stripe'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getStaffCompanyId() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id || profile.role !== 'company_admin') return null
  return profile.company_id as string
}

export async function POST(request: Request) {
  try {
    const companyId = await getStaffCompanyId()
    if (!companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdmin()
    const { data: company, error } = await admin
      .from('companies')
      .select('stripe_platform_customer_id')
      .eq('id', companyId)
      .single()

    if (error || !company?.stripe_platform_customer_id) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 404 })
    }

    const origin = new URL(request.url).origin
    const portal = await stripe.billingPortal.sessions.create({
      customer: company.stripe_platform_customer_id,
      return_url: `${origin}/dashboard/settings?section=subscription`,
    })

    return NextResponse.json({ url: portal.url })
  } catch (error: any) {
    console.error('Billing portal error:', error)
    return NextResponse.json({ error: error.message || 'Portal failed' }, { status: 500 })
  }
}