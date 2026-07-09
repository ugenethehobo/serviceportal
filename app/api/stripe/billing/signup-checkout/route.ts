import { NextResponse } from 'next/server'
import { createEmbeddedSignupCheckout } from '@/lib/platform-signup-server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const plan = body.plan
    const billingInterval = body.billingInterval === 'year' ? 'year' : 'month'

    if (plan !== 'basic' && plan !== 'pro') {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const origin = new URL(request.url).origin
    const checkout = await createEmbeddedSignupCheckout(plan, origin, billingInterval)

    return NextResponse.json(checkout)
  } catch (error: any) {
    console.error('Signup checkout error:', error)
    return NextResponse.json({ error: error.message || 'Checkout failed' }, { status: 500 })
  }
}