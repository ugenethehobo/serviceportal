import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createSupabaseAdmin } from '@/lib/portal-auth'

export async function getIntegrationOAuthUser() {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

export async function assertCompanyAdminForIntegrations(userId: string) {
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
      error: 'Only company admins can manage integrations',
      status: 403 as const,
    }
  }

  const { assertCompanyPlatformFeature } = await import('@/lib/platform-entitlements-server')
  const featureGate = await assertCompanyPlatformFeature(profile.company_id, 'integrations')
  if (!featureGate.ok) {
    return { ok: false as const, error: featureGate.error, status: 403 as const }
  }

  return {
    ok: true as const,
    companyId: profile.company_id,
    userId,
  }
}