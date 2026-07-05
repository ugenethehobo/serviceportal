import { createClient } from '@supabase/supabase-js'
import {
  canAccessPlatformFeature,
  getCrewLimitForPlan,
  getCrewLimitMessage,
  getPlatformFeatureUpgradeMessage,
  type PlatformFeature,
} from '@/lib/platform-entitlements'
import { getCompanySubscriptionAccessForCompany } from '@/lib/platform-trial-server'
import { TRIAL_EXPIRED_ERROR } from '@/lib/portal-auth'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function assertCompanyPlatformFeature(
  companyId: string,
  feature: PlatformFeature
) {
  const access = await getCompanySubscriptionAccessForCompany(companyId)
  if (!access?.hasAccess) {
    return { ok: false as const, error: TRIAL_EXPIRED_ERROR }
  }
  if (!canAccessPlatformFeature(access.plan, feature)) {
    return {
      ok: false as const,
      error: getPlatformFeatureUpgradeMessage(feature),
      plan: access.plan,
    }
  }
  return { ok: true as const, plan: access.plan, access }
}

export async function assertCompanyCrewCreationAllowed(companyId: string) {
  const access = await getCompanySubscriptionAccessForCompany(companyId)
  if (!access?.hasAccess) {
    return { ok: false as const, error: TRIAL_EXPIRED_ERROR }
  }

  const crewLimit = getCrewLimitForPlan(access.plan)
  if (crewLimit === null) {
    return { ok: true as const, plan: access.plan, crewLimit }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { count, error } = await supabaseAdmin
    .from('crews')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)

  if (error) {
    return { ok: false as const, error: error.message }
  }

  if ((count ?? 0) >= crewLimit) {
    return {
      ok: false as const,
      error: getCrewLimitMessage(access.plan, crewLimit),
      plan: access.plan,
      crewLimit,
    }
  }

  return { ok: true as const, plan: access.plan, crewLimit }
}