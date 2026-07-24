'use server'

import {
  buildPasswordResetVerifyUrl,
  getPasswordResetRedirectUrl,
} from '@/lib/auth-password-reset'
import { sendPasswordResetEmail } from '@/lib/email/password-reset-email'
import { isResendConfigured } from '@/lib/email/resend'
import { createSupabaseAdmin } from '@/lib/portal-auth'
import { createClient } from '@/lib/supabase/server'

/** Always succeeds from the caller's perspective to avoid email enumeration. */
export async function requestPasswordResetAction(email: string) {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !trimmed.includes('@')) {
    return { ok: true as const }
  }

  try {
    if (isResendConfigured()) {
      const admin = createSupabaseAdmin()
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: trimmed,
      })

      if (error || !data?.properties?.hashed_token) {
        if (error) {
          console.warn('requestPasswordResetAction generateLink:', error.message)
        }
        return { ok: true as const }
      }

      const resetUrl = buildPasswordResetVerifyUrl(data.properties.hashed_token)
      const sendResult = await sendPasswordResetEmail({
        to: trimmed,
        resetUrl,
      })

      if (!sendResult.ok) {
        console.warn('requestPasswordResetAction Resend:', sendResult.error)
      }

      return { ok: true as const }
    }

    const supabase = await createClient()
    await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: getPasswordResetRedirectUrl(),
    })
  } catch (error) {
    console.warn('requestPasswordResetAction error:', error)
  }

  return { ok: true as const }
}

/** Portal-only gate — never blocks staff/admin logins; fails open if schema is missing. */
export async function verifyClientPortalLoginAction(userId: string) {
  try {
    const admin = createSupabaseAdmin()

    const { data: profile } = await admin
      .from('profiles')
      .select('role, client_id, portal_access_expires_at')
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

    const { isPortalAccessExpired } = await import('@/lib/portal-users')
    if (isPortalAccessExpired(profile.portal_access_expires_at)) {
      return {
        ok: false as const,
        error: 'Portal access has expired. Contact your service provider.',
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

    // Multi-login: any profile linked via client_id may sign in.
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