import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { session_id } = await request.json()

    if (!session_id) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

    // Retrieve the Checkout Session (Stripe allows this from the platform for Connect sessions)
    const session = await stripe.checkout.sessions.retrieve(session_id)

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ success: false, error: 'Payment has not been completed' })
    }

    const billIdsStr = session.metadata?.billIds || ''
    const billIds = billIdsStr ? billIdsStr.split(',').filter(Boolean) : []

    if (billIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No bill references found in payment session' })
    }

    // Use service role key for a reliable status update (bypasses RLS, consistent with Stripe Connect callback)
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error: updateError } = await serviceSupabase
      .from('bills')
      .update({ status: 'paid' })
      .in('id', billIds)

    if (updateError) {
      console.error('Failed to mark bills paid after Stripe success:', updateError)
      return NextResponse.json({ success: false, error: 'Could not update billing records' })
    }

    return NextResponse.json({ success: true, updatedBillIds: billIds })
  } catch (error: any) {
    console.error('Confirm payment error:', error)
    return NextResponse.json({ success: false, error: error.message || 'Verification failed' }, { status: 500 })
  }
}
