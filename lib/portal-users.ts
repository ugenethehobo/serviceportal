import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

/** Preset access windows for portal logins. `none` = never expires. */
export type PortalAccessDuration = 'none' | '7d' | '30d' | '90d' | '1y'

export const PORTAL_ACCESS_DURATION_LABELS: Record<PortalAccessDuration, string> = {
  none: 'No time limit',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  '1y': '1 year',
}

export function portalAccessExpiresAtFromDuration(
  duration: PortalAccessDuration,
  from: Date = new Date()
): string | null {
  if (duration === 'none') return null
  const expires = new Date(from.getTime())
  if (duration === '7d') expires.setUTCDate(expires.getUTCDate() + 7)
  else if (duration === '30d') expires.setUTCDate(expires.getUTCDate() + 30)
  else if (duration === '90d') expires.setUTCDate(expires.getUTCDate() + 90)
  else if (duration === '1y') expires.setUTCFullYear(expires.getUTCFullYear() + 1)
  return expires.toISOString()
}

export function isPortalAccessExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const ms = Date.parse(expiresAt)
  if (Number.isNaN(ms)) return false
  return ms <= Date.now()
}

export function formatPortalAccessExpiry(
  expiresAt: string | null | undefined,
  timezone?: string
): string {
  if (!expiresAt) return 'No time limit'
  if (isPortalAccessExpired(expiresAt)) return 'Expired'
  try {
    return new Date(expiresAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timezone ? { timeZone: timezone } : {}),
    })
  } catch {
    return new Date(expiresAt).toLocaleString()
  }
}

export function createPortalSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}

export async function findAuthUserByEmail(
  supabaseAdmin: SupabaseClient,
  email: string
): Promise<User | null> {
  const normalized = email.toLowerCase()
  let page = 1

  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error

    const match = data.users.find((user) => user.email?.toLowerCase() === normalized)
    if (match) return match

    if (data.users.length < 200) break
    page++
  }

  return null
}

/** All portal profiles linked to a client (multi-login). */
export async function findProfilesByClientId(
  supabaseAdmin: SupabaseClient,
  clientId: string
) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, role, client_id, created_at, portal_access_expires_at')
    .eq('client_id', clientId)
    .eq('role', 'client')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

/** First portal profile for a client (legacy single-user helpers). */
export async function findProfileByClientId(
  supabaseAdmin: SupabaseClient,
  clientId: string
) {
  const profiles = await findProfilesByClientId(supabaseAdmin, clientId)
  return profiles[0] ?? null
}

export async function findProfileByEmail(
  supabaseAdmin: SupabaseClient,
  email: string
) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, client_id')
    .ilike('email', email)
    .maybeSingle()

  return data
}

export async function assertPortalEmailAvailable(
  supabaseAdmin: SupabaseClient,
  email: string,
  clientId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await findProfileByEmail(supabaseAdmin, email)

  if (profile && profile.role !== 'client') {
    return { ok: false, error: 'This email is already used by a team member account' }
  }

  if (profile?.client_id && profile.client_id !== clientId) {
    return { ok: false, error: 'This email is already linked to another client portal' }
  }

  if (profile?.client_id === clientId) {
    return {
      ok: false,
      error: 'This email already has portal access for this client',
    }
  }

  return { ok: true }
}

export async function upsertClientPortalProfile(
  supabaseAdmin: SupabaseClient,
  data: {
    userId: string
    fullName: string
    email: string
    companyId: string
    clientId: string
    /** ISO timestamp, or null for no expiry. Omit to leave existing value on update. */
    portalAccessExpiresAt?: string | null
  }
) {
  const row: Record<string, unknown> = {
    id: data.userId,
    full_name: data.fullName,
    email: data.email,
    company_id: data.companyId,
    client_id: data.clientId,
    status: 'Active',
    role: 'client',
  }
  if (data.portalAccessExpiresAt !== undefined) {
    row.portal_access_expires_at = data.portalAccessExpiresAt
  }

  const { error } = await supabaseAdmin.from('profiles').upsert(row, { onConflict: 'id' })

  if (error) throw error
}

/**
 * Enable portal for the client and link a login.
 * `auth_user_id` stays the first (primary) linked user for legacy callers;
 * additional logins only need profiles.client_id.
 */
export async function linkClientPortalAccess(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  authUserId: string,
  email?: string | null
) {
  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('auth_user_id')
    .eq('id', clientId)
    .maybeSingle()

  const { error } = await supabaseAdmin
    .from('clients')
    .update({
      portal_enabled: true,
      portal_invited_at: new Date().toISOString(),
      ...(client?.auth_user_id ? {} : { auth_user_id: authUserId }),
      ...(email ? { email } : {}),
    })
    .eq('id', clientId)

  if (error) throw error
}

/** After removing a portal user, keep auth_user_id pointing at a remaining login. */
export async function refreshClientPortalPrimaryUser(
  supabaseAdmin: SupabaseClient,
  clientId: string
) {
  const remaining = await findProfilesByClientId(supabaseAdmin, clientId)
  const primaryId = remaining[0]?.id ?? null

  const { error } = await supabaseAdmin
    .from('clients')
    .update({
      auth_user_id: primaryId,
      portal_enabled: remaining.length > 0 ? true : false,
      ...(remaining.length === 0
        ? { portal_invited_at: null, portal_last_login_at: null }
        : {}),
    })
    .eq('id', clientId)

  if (error) throw error
  return remaining
}

export function isEmailAlreadyRegisteredError(message?: string) {
  if (!message) return false
  const lower = message.toLowerCase()
  return lower.includes('already been registered') || lower.includes('already registered')
}
