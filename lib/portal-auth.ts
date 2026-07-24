import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

/** HttpOnly cookie: staff preview of a specific client portal. */
export const PORTAL_PREVIEW_CLIENT_COOKIE = 'portal_preview_client_id'

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

export const getSessionProfile = cache(async (): Promise<{
  userId: string
  profile: PortalProfile
} | null> => {
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
})

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
    const { data: portalProfile } = await admin
      .from('profiles')
      .select('portal_access_expires_at')
      .eq('id', session.userId)
      .maybeSingle()
    const { isPortalAccessExpired } = await import('@/lib/portal-users')
    if (isPortalAccessExpired(portalProfile?.portal_access_expires_at)) {
      return {
        ok: false as const,
        error: 'Portal access has expired. Contact your service provider.',
      }
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

    const previewClientId = await getPortalPreviewClientIdFromCookies()
    if (previewClientId && previewClientId === clientId) {
      return { ok: true as const, profile, mode: 'staff_preview' as const }
    }

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

export type PortalShellData = {
  clientId: string
  clientName: string
  companyName: string
  /** Storage path or legacy URL from companies.logo_url — resolve before display. */
  companyLogoRef: string | null
  /** Staff viewing the portal as this client (read-only writes). */
  isPreview?: boolean
  /** Dashboard path to return to when leaving staff preview. */
  previewReturnPath?: string | null
}

export type PortalSessionContext = {
  profile: PortalProfile
  clientId: string
  companyId: string
  clientName: string
  portalEnabled: boolean
  isPreview: boolean
}

export async function getPortalPreviewClientIdFromCookies(): Promise<string | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(PORTAL_PREVIEW_CLIENT_COOKIE)?.value?.trim()
  return value || null
}

/**
 * Resolve the active portal client for a real client login or staff preview cookie.
 */
export async function resolvePortalSession(): Promise<PortalSessionContext | null> {
  const session = await getSessionProfile()
  if (!session) return null

  const { profile } = session
  const admin = createSupabaseAdmin()

  if (profile.role === 'client' && profile.client_id) {
    const { data: portalProfile } = await admin
      .from('profiles')
      .select('portal_access_expires_at, client_id')
      .eq('id', session.userId)
      .maybeSingle()

    if (!portalProfile?.client_id || portalProfile.client_id !== profile.client_id) {
      return null
    }

    const { isPortalAccessExpired } = await import('@/lib/portal-users')
    if (isPortalAccessExpired(portalProfile.portal_access_expires_at)) {
      return null
    }

    const { data: client } = await admin
      .from('clients')
      .select('id, name, portal_enabled, auth_user_id, company_id')
      .eq('id', profile.client_id)
      .single()

    if (!client?.company_id || client.portal_enabled === false) {
      return null
    }

    // Multi-login: keep primary pointer for legacy callers when empty.
    if (!client.auth_user_id) {
      await admin
        .from('clients')
        .update({ auth_user_id: session.userId, portal_enabled: true })
        .eq('id', profile.client_id)
    }

    return {
      profile,
      clientId: profile.client_id,
      companyId: client.company_id,
      clientName: client.name || 'Client',
      portalEnabled: client.portal_enabled,
      isPreview: false,
    }
  }

  if (isStaffRole(profile.role) && profile.company_id) {
    const previewClientId = await getPortalPreviewClientIdFromCookies()
    if (!previewClientId) return null

    const { data: client } = await admin
      .from('clients')
      .select('id, name, portal_enabled, company_id')
      .eq('id', previewClientId)
      .eq('company_id', profile.company_id)
      .maybeSingle()

    if (!client?.company_id) return null

    // Staff may preview even when portal is disabled (to verify setup).
    return {
      profile,
      clientId: client.id,
      companyId: client.company_id,
      clientName: client.name || 'Client',
      portalEnabled: Boolean(client.portal_enabled),
      isPreview: true,
    }
  }

  return null
}

export const getPortalShellDataAction = cache(async (): Promise<
  { success: true; data: PortalShellData } | { success: false; error: string }
> => {
  const portal = await resolvePortalSession()
  if (!portal) {
    return { success: false, error: 'Not authenticated' }
  }

  const admin = createSupabaseAdmin()
  const { data: company } = await admin
    .from('companies')
    .select('name, logo_url')
    .eq('id', portal.companyId)
    .maybeSingle()

  return {
    success: true,
    data: {
      clientId: portal.clientId,
      clientName: portal.clientName,
      companyName: company?.name || 'Your service provider',
      companyLogoRef: company?.logo_url ?? null,
      isPreview: portal.isPreview,
      previewReturnPath: portal.isPreview
        ? `/dashboard/clients/${portal.clientId}?tab=portal`
        : null,
    },
  }
})