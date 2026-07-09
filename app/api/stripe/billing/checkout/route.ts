import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { stripe } from '@/lib/stripe'
import { getPlatformPriceId, type PlatformPlanId } from '@/lib/platform-billing'

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

    const body = await request.json()
    const plan = body.plan as PlatformPlanId
    if (plan !== 'basic' && plan !== 'pro') {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const billingInterval = body.billingInterval === 'year' ? 'year' : 'month'
    const priceId = getPlatformPriceId(plan, billingInterval)
    if (!priceId) {
      return NextResponse.json(
        {
          error:
            billingInterval === 'year'
              ? 'Annual platform billing is not configured.'
              : 'Platform billing is not configured. Set STRIPE_PLATFORM_PRICE_BASIC/PRO.',
        },
        { status: 503 }
      )
    }

    const admin = createSupabaseAdmin()
    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('id, name, stripe_platform_customer_id')
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    let customerId = company.stripe_platform_customer_id as string | null
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: company.name,
        metadata: { company_id: companyId },
      })
      customerId = customer.id
      await admin
        .from('companies')
        .update({ stripe_platform_customer_id: customerId })
        .eq('id', companyId)
    }

    const origin = new URL(request.url).origin
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/settings?section=subscription&checkout=success`,
      cancel_url: `${origin}/dashboard/settings?section=subscription&checkout=cancel`,
      metadata: { company_id: companyId, plan },
      subscription_data: {
        metadata: { company_id: companyId, plan },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Platform checkout error:', error)
    return NextResponse.json({ error: error.message || 'Checkout failed' }, { status: 500 })
  }
}