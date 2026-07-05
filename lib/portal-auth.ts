import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export type PortalProfile = {
  id: string
  role: string
  company_id: string | null
  client_id: string | null
  full_name: string | null
  email: string | null
}

export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  return trimmed || null
}

export async function getAuthUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // read-only outside Server Actions / Route Handlers
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value: '', ...options, maxAge: 0 })
          } catch {
            // see set()
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

export async function assertPlatformAdminSession() {
  const user = await getAuthUser()
  if (!user) {
    return { ok: false as const, error: 'Not authenticated' }
  }

  const adminEmail = normalizeEmail(process.env.NEXT_PUBLIC_ADMIN_EMAIL)
  const userEmail = normalizeEmail(user.email)
  if (!adminEmail || userEmail !== adminEmail) {
    return { ok: false as const, error: 'Unauthorized' }
  }

  return { ok: true as const, userId: user.id, email: user.email! }
}

export async function getSessionProfile(): Promise<{
  userId: string
  profile: PortalProfile
} | null> {
  const user = await getAuthUser()
  if (!user) return null

  const admin = createSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, company_id, client_id, full_name, email')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  return { userId: user.id, profile: profile as PortalProfile }
}

export function isStaffRole(role: string) {
  return role === 'company_admin' || role === 'team_member'
}

export const TRIAL_EXPIRED_ERROR =
  'Your free trial has ended. Subscribe to continue using the platform.'

export async function verifyStaffSubscriptionAccess(companyId: string) {
  const { getCompanySubscriptionAccessForCompany } = await import(
    '@/lib/platform-trial-server'
  )
  const access = await getCompanySubscriptionAccessForCompany(companyId)
  if (!access?.hasAccess) {
    return { ok: false as const, error: TRIAL_EXPIRED_ERROR, access }
  }
  return { ok: true as const, access }
}

export async function assertClientPortalAccess(clientId: string) {
  const session = await getSessionProfile()
  if (!session) return { ok: false as const, error: 'Unauthorized' }

  const { profile } = session

  if (profile.role === 'client') {
    if (profile.client_id !== clientId) {
      return { ok: false as const, error: 'Forbidden' }
    }
    const admin = createSupabaseAdmin()
    const { data: client } = await admin
      .from('clients')
      .select('portal_enabled')
      .eq('id', clientId)
      .single()
    if (!client?.portal_enabled) {
      return { ok: false as const, error: 'Portal access disabled' }
    }
    return { ok: true as const, profile, mode: 'client' as const }
  }

  if (isStaffRole(profile.role) && profile.company_id) {
    const admin = createSupabaseAdmin()
    const { data: client } = await admin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('company_id', profile.company_id)
      .single()
    if (!client) return { ok: false as const, error: 'Client not found' }
    return { ok: true as const, profile, mode: 'staff' as const }
  }

  return { ok: false as const, error: 'Forbidden' }
}

export async function assertJobAccess(scheduleId: string, clientId: string) {
  const access = await assertClientPortalAccess(clientId)
  if (!access.ok) return access

  const admin = createSupabaseAdmin()
  const { data: schedule } = await admin
    .from('schedules')
    .select('id')
    .eq('id', scheduleId)
    .eq('client_id', clientId)
    .single()

  if (!schedule) return { ok: false as const, error: 'Job not found' }

  return { ok: true as const, profile: access.profile, mode: access.mode }
}

export function getPostLoginPath(role: string, adminEmail?: string | null, userEmail?: string | null) {
  if (userEmail && adminEmail && userEmail === adminEmail) return '/admin'
  if (role === 'client') return '/portal'
  if (role === 'team_member') return '/dashboard/team'
  return '/dashboard'
}