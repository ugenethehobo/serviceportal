'use server'

import { createSupabaseAdmin } from '@/lib/portal-auth'

/** Portal-only gate — never blocks staff/admin logins; fails open if schema is missing. */
export async function verifyClientPortalLoginAction(userId: string) {
  try {
    const admin = createSupabaseAdmin()

    const { data: profile } = await admin
      .from('profiles')
      .select('role, client_id')
      .eq('id', userId)
      .single()

    if (!profile || profile.role !== 'client') {
      return { ok: true as const }
    }

    if (!profile.client_id) {
      return {
        ok: false as const,
        error: 'Portal account is incomplete. Ask your service provider to recreate your portal login.',
      }
    }

    const { data: client, error: clientError } = await admin
      .from('clients')
      .select('portal_enabled, auth_user_id')
      .eq('id', profile.client_id)
      .single()

    if (clientError) {
      console.warn('verifyClientPortalLoginAction: clients query failed', clientError.message)
      return { ok: true as const }
    }

    if (client.portal_enabled === false) {
      return {
        ok: false as const,
        error: 'Portal access is disabled. Contact your service provider.',
      }
    }

    if (client.auth_user_id && client.auth_user_id !== userId) {
      return {
        ok: false as const,
        error: 'This portal account is misconfigured. Contact your service provider.',
      }
    }

    if (!client.auth_user_id) {
      await admin
        .from('clients')
        .update({ auth_user_id: userId, portal_enabled: true })
        .eq('id', profile.client_id)
    }

    const { error: loginTrackError } = await admin
      .from('clients')
      .update({ portal_last_login_at: new Date().toISOString() })
      .eq('id', profile.client_id)

    if (loginTrackError) {
      console.warn('verifyClientPortalLoginAction: login track failed', loginTrackError.message)
    }

    return { ok: true as const }
  } catch (error) {
    console.warn('verifyClientPortalLoginAction error:', error)
    return { ok: true as const }
  }
}