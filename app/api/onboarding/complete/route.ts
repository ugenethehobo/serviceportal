import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Service role client (for creating users and bypassing RLS during provisioning)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, intakeData, password } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    // 1. Verify the Stripe Checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return NextResponse.json({ 
        error: 'Payment has not been completed' 
      }, { status: 400 })
    }

    const customerEmail = session.customer_email || intakeData?.company_email
    if (!customerEmail) {
      return NextResponse.json({ 
        error: 'No email found for account creation' 
      }, { status: 400 })
    }

    console.log('✅ Payment verified for session:', sessionId)
    console.log('Creating account for:', customerEmail)

    // 2. Create the Supabase Auth user using service role (no password)
    // We will send a password reset / magic link instead of a random password
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: customerEmail,
      password: password || undefined, // Use password chosen by user in the wizard
      email_confirm: true,
      user_metadata: {
        full_name: intakeData?.company_name || 'New User',
        business_name: intakeData?.company_name,
        onboarding_completed: true,
      },
    })

    if (authError) {
      console.error('Auth user creation error:', authError)
      return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 })
    }

    const userId = authUser.user.id

    // No more magic link. The user set their own password during the wizard.
    // We can optionally send a simple welcome email here if desired (without auth links).
    console.log('[onboarding/complete] User account created with password for:', customerEmail)

    // 3. Create Company record (new schema)
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name: intakeData?.company_name || 'Untitled Company',
        owner_user_id: userId,
        stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        subscription_status: 'active', // Will be updated by webhook if trial is used; start as active for paid subs
        onboarding_completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (companyError) {
      console.error('Company creation error:', companyError)
      // Fall back to old behavior if migration not run
    }

    const companyId = company?.id

    // 4. Create Subscription record (new schema)
    let subscriptionStatus = 'active';
    let plan = 'monthly';
    let currentPeriodEnd = null;

    if (session.subscription) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        subscriptionStatus = stripeSub.status;
        plan = stripeSub.items.data[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly';
        currentPeriodEnd = (stripeSub as any).current_period_end 
          ? new Date((stripeSub as any).current_period_end * 1000).toISOString() 
          : null;
      } catch (e) {
        console.error('Failed to retrieve Stripe subscription details:', e);
      }
    }

    if (companyId) {
      const { error: subError } = await supabaseAdmin.from('subscriptions').insert({
        company_id: companyId,
        stripe_subscription_id: session.subscription || null,
        status: subscriptionStatus,
        plan,
        current_period_end: currentPeriodEnd,
      });

      if (subError) {
        console.error('Failed to create subscription record:', subError);
      }

      // Link user to company
      const { error: linkError } = await supabaseAdmin.from('company_users').insert({
        company_id: companyId,
        user_id: userId,
        role: 'owner',
      });

      if (linkError) {
        console.error('Failed to create company_users link:', linkError);
      }
    }

    // 5. Seed company_settings (with company_id now that we have the new schema)
    const settingsPayload: any = {
      user_id: userId,
      company_id: companyId, // Now populated thanks to migration
      company_name: intakeData?.company_name,
      company_address: intakeData?.company_address,
      company_email: intakeData?.company_email,
      company_phone: intakeData?.company_phone,
      primary_color: intakeData?.primary_color || '#000000',
      logo_url: intakeData?.logo_url || null,
      default_timezone: intakeData?.default_timezone || 'America/Chicago',
      default_job_duration_minutes: intakeData?.default_job_duration_minutes || 60,
      route_planner_enabled: intakeData?.route_planner_enabled ?? false,
      mapbox_access_token: intakeData?.mapbox_access_token || '',
      lead_fresh_days: intakeData?.lead_fresh_days ?? 7,
      lead_stale_days: intakeData?.lead_stale_days ?? 30,
      job_statuses: intakeData?.job_statuses || undefined,
      updated_at: new Date().toISOString(),
    }

    const { error: settingsError } = await supabaseAdmin
      .from('company_settings')
      .upsert(settingsPayload)

    if (settingsError) {
      console.error('company_settings seeding error:', settingsError)
    }

    // 6. Record the onboarding intake (now reliable post-migration)
    const { error: intakeError } = await supabaseAdmin.from('onboarding_intakes').insert({
      stripe_checkout_session_id: sessionId,
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      intake_data: intakeData,
      status: 'completed',
      completed_at: new Date().toISOString(),
    });

    if (intakeError) {
      console.error('Failed to record onboarding intake:', intakeError);
    }

    console.log('✅ Account provisioning completed for user:', userId, 'company:', companyId)

    return NextResponse.json({ 
      success: true,
      userId,
      companyId,
      email: customerEmail,
      message: 'Account created successfully. You can now log in with your email and password.',
    })

  } catch (error: any) {
    console.error('Onboarding complete error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to complete onboarding' 
    }, { status: 500 })
  }
}


