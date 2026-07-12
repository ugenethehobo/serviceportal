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

export async function ensureStripeConnectAccount(companyId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select(
      'id, name, stripe_account_id, address_street, address_city, address_state, address_zip, address'
    )
    .eq('id', companyId)
    .single()

  if (!company) throw new Error('Company not found')

  let accountId = company.stripe_account_id

  const businessProfile: {
    name?: string
    support_address?: {
      line1?: string
      city?: string
      state?: string
      postal_code?: string
      country: string
    }
  } = {}

  if (company.name) {
    businessProfile.name = company.name
  }

  if (company.address_street || company.address_city || company.address_state || company.address_zip) {
    businessProfile.support_address = {
      line1: company.address_street || company.address || undefined,
      city: company.address_city || undefined,
      state: company.address_state || undefined,
      postal_code: company.address_zip || undefined,
      country: 'US',
    }
  }

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      metadata: { company_id: companyId },
      business_profile: businessProfile,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    })
    accountId = account.id

    await supabaseAdmin
      .from('companies')
      .update({ stripe_account_id: accountId })
      .eq('id', companyId)
  } else if (Object.keys(businessProfile).length > 0) {
    await stripe.accounts.update(accountId, {
      business_profile: businessProfile,
    })
  }

  return accountId
}

export async function createStripeConnectAccountSession(companyId: string) {
  const accountId = await ensureStripeConnectAccount(companyId)

  const accountSession = await stripe.accountSessions.create({
    account: accountId,
    components: {
      account_onboarding: {
        enabled: true,
        features: {
          external_account_collection: true,
        },
      },
    },
  })

  if (!accountSession.client_secret) {
    throw new Error('Failed to create Stripe account session')
  }

  return {
    clientSecret: accountSession.client_secret,
    accountId,
  }
}

export async function createStripeConnectLink(
  companyId: string,
  origin: string,
  returnTo: 'settings' | 'onboarding' = 'settings'
) {
  const accountId = await ensureStripeConnectAccount(companyId)

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

export type StripeMonthCollectedResult = {
  amount: number
  source: 'stripe' | 'recorded'
}

export async function getStripeConnectMonthCollected(
  stripeAccountId: string,
  bounds: { start: Date; end: Date }
): Promise<number> {
  const created = {
    gte: Math.floor(bounds.start.getTime() / 1000),
    lte: Math.floor(bounds.end.getTime() / 1000),
  }

  let totalCents = 0
  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    const page = await stripe.balanceTransactions.list(
      {
        created,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      { stripeAccount: stripeAccountId }
    )

    for (const txn of page.data) {
      if (txn.type === 'charge' || txn.type === 'payment') {
        totalCents += txn.net
      }
    }

    hasMore = page.has_more
    startingAfter = page.data.at(-1)?.id
    if (!startingAfter) break
  }

  return Math.round(totalCents) / 100
}

export async function resolveMonthCollectedAmount(input: {
  companyId: string
  stripeAccountId: string | null
  billingEnabled: boolean
  bounds: { start: Date; end: Date }
  recordedAllPayments: number
  recordedStripePayments: number
}): Promise<StripeMonthCollectedResult> {
  if (!input.billingEnabled || !input.stripeAccountId) {
    return {
      amount: input.recordedAllPayments,
      source: 'recorded',
    }
  }

  try {
    const amount = await getStripeConnectMonthCollected(
      input.stripeAccountId,
      input.bounds
    )
    return { amount, source: 'stripe' }
  } catch (error) {
    console.error('getStripeConnectMonthCollected error:', error)
    return {
      amount: input.recordedStripePayments,
      source: 'recorded',
    }
  }
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