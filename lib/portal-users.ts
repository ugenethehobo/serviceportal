import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

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

export async function findProfileByClientId(
  supabaseAdmin: SupabaseClient,
  clientId: string
) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, client_id')
    .eq('client_id', clientId)
    .maybeSingle()

  return data
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
  }
) {
  const { error } = await supabaseAdmin.from('profiles').upsert(
    {
      id: data.userId,
      full_name: data.fullName,
      email: data.email,
      company_id: data.companyId,
      client_id: data.clientId,
      status: 'Active',
      role: 'client',
    },
    { onConflict: 'id' }
  )

  if (error) throw error
}

export async function linkClientPortalAccess(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  authUserId: string,
  email?: string | null
) {
  const { error } = await supabaseAdmin
    .from('clients')
    .update({
      auth_user_id: authUserId,
      portal_enabled: true,
      portal_invited_at: new Date().toISOString(),
      ...(email ? { email } : {}),
    })
    .eq('id', clientId)

  if (error) throw error
}

export function isEmailAlreadyRegisteredError(message?: string) {
  if (!message) return false
  const lower = message.toLowerCase()
  return lower.includes('already been registered') || lower.includes('already registered')
}