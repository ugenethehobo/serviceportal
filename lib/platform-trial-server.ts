import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateCompanySubscriptionAccess,
  resolveTrialEndsAt,
  shouldBackfillTrialEndsAt,
  type CompanySubscriptionAccess,
  type CompanySubscriptionRecord,
} from '@/lib/platform-trial'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function loadCompanySubscriptionRecord(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<CompanySubscriptionRecord | null> {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select(
      'subscription_plan, subscription_status, trial_ends_at, promo_code, stripe_platform_subscription_id, created_at'
    )
    .eq('id', companyId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function ensureCompanyTrialClock(
  supabaseAdmin: SupabaseClient,
  company: CompanySubscriptionRecord & { id?: string },
  companyId: string
): Promise<CompanySubscriptionRecord> {
  if (!shouldBackfillTrialEndsAt(company)) {
    return company
  }

  const trialEndsAt = resolveTrialEndsAt(company)
  if (!trialEndsAt) return company

  const { error } = await supabaseAdmin
    .from('companies')
    .update({
      trial_ends_at: trialEndsAt,
      subscription_plan: 'trial',
      subscription_status: 'trialing',
    })
    .eq('id', companyId)

  if (error?.code === '42703') {
    return { ...company, trial_ends_at: trialEndsAt }
  }
  if (error) throw error

  return { ...company, trial_ends_at: trialEndsAt }
}

export async function syncTrialExpiredStatus(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  access: CompanySubscriptionAccess
) {
  if (!access.isTrialExpired) return

  await supabaseAdmin
    .from('companies')
    .update({ subscription_status: 'trial_expired' })
    .eq('id', companyId)
    .eq('subscription_plan', 'trial')
}

export async function getCompanySubscriptionAccessForCompany(
  companyId: string,
  now = new Date()
): Promise<CompanySubscriptionAccess | null> {
  const supabaseAdmin = createSupabaseAdmin()
  const [{ getPlatformSettings }, company] = await Promise.all([
    import('@/lib/platform-settings-server'),
    loadCompanySubscriptionRecord(supabaseAdmin, companyId),
  ])
  if (!company) return null

  const { scheduledReleaseAt } = await getPlatformSettings()
  const withClock = await ensureCompanyTrialClock(supabaseAdmin, company, companyId)
  const access = evaluateCompanySubscriptionAccess(withClock, now, { scheduledReleaseAt })
  await syncTrialExpiredStatus(supabaseAdmin, companyId, access)
  return access
}

export async function getCompanySubscriptionAccessForClient(
  clientId: string,
  now = new Date()
): Promise<CompanySubscriptionAccess | null> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('company_id')
    .eq('id', clientId)
    .maybeSingle()

  if (!client?.company_id) return null
  return getCompanySubscriptionAccessForCompany(client.company_id, now)
}