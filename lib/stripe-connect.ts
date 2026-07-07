import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}

export interface CompanyStripeStatus {
  companyId: string
  stripeAccountId: string | null
  chargesEnabled: boolean
  onboardingComplete: boolean
  billingEnabled: boolean
}

export async function getCompanyStripeStatus(companyId: string): Promise<CompanyStripeStatus> {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('id, stripe_account_id, stripe_charges_enabled, stripe_onboarding_complete')
    .eq('id', companyId)
    .single()

  const stripeAccountId = company?.stripe_account_id ?? null
  const chargesEnabled = company?.stripe_charges_enabled ?? false
  const onboardingComplete = company?.stripe_onboarding_complete ?? false

  return {
    companyId,
    stripeAccountId,
    chargesEnabled,
    onboardingComplete,
    billingEnabled: !!(stripeAccountId && chargesEnabled),
  }
}

export async function syncCompanyStripeAccount(companyId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('stripe_account_id')
    .eq('id', companyId)
    .single()

  if (!company?.stripe_account_id) {
    return getCompanyStripeStatus(companyId)
  }

  const account = await stripe.accounts.retrieve(company.stripe_account_id)

  await supabaseAdmin
    .from('companies')
    .update({
      stripe_charges_enabled: account.charges_enabled ?? false,
      stripe_onboarding_complete: account.details_submitted ?? false,
    })
    .eq('id', companyId)

  return getCompanyStripeStatus(companyId)
}

export async function createStripeConnectLink(
  companyId: string,
  origin: string,
  returnTo: 'settings' | 'onboarding' = 'settings'
) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('id, name, stripe_account_id')
    .eq('id', companyId)
    .single()

  if (!company) throw new Error('Company not found')

  let accountId = company.stripe_account_id

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      metadata: { company_id: companyId },
      business_profile: {
        name: company.name,
      },
    })
    accountId = account.id

    await supabaseAdmin
      .from('companies')
      .update({ stripe_account_id: accountId })
      .eq('id', companyId)
  }

  const returnUrl =
    returnTo === 'onboarding'
      ? `${origin}/onboarding?stripe=return&step=payments`
      : `${origin}/dashboard/settings?stripe=return`
  const refreshUrl =
    returnTo === 'onboarding'
      ? `${origin}/onboarding?stripe=refresh&step=payments`
      : `${origin}/dashboard/settings?stripe=refresh`

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  })

  return { url: accountLink.url, accountId }
}

export async function getCompanyIdForUser(userId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('company_id')
    .eq('id', userId)
    .single()

  return profile?.company_id ?? null
}

export async function assertCompanyAdminForStripe(userId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single()

  if (!profile?.company_id) {
    return { ok: false as const, error: 'No company found', status: 404 as const }
  }

  if (profile.role !== 'company_admin') {
    return {
      ok: false as const,
      error: 'Only company admins can manage Stripe Connect',
      status: 403 as const,
    }
  }

  return {
    ok: true as const,
    companyId: profile.company_id,
    userId,
  }
}