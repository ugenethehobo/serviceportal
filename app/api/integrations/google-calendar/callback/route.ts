import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/portal-auth'
import {
  buildGoogleCalendarIntegrationSecrets,
  exchangeGoogleCalendarAuthCode,
  normalizeGoogleCalendarIntegrationConfig,
  verifyGoogleCalendarOAuthState,
} from '@/lib/google-calendar-oauth'

function settingsRedirect(origin: string, params: Record<string, string>) {
  const url = new URL('/dashboard/settings', origin)
  url.searchParams.set('section', 'integrations')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')

  if (oauthError) {
    return settingsRedirect(origin, {
      google_calendar: 'error',
      message: oauthError,
    })
  }

  if (!code || !state) {
    return settingsRedirect(origin, {
      google_calendar: 'error',
      message: 'Missing Google Calendar authorization response',
    })
  }

  const verified = verifyGoogleCalendarOAuthState(state)
  if (!verified) {
    return settingsRedirect(origin, {
      google_calendar: 'error',
      message: 'Invalid or expired Google Calendar OAuth state',
    })
  }

  try {
    const tokens = await exchangeGoogleCalendarAuthCode(code)
    const supabaseAdmin = createSupabaseAdmin()
    const now = new Date().toISOString()

    const { data: existing } = await supabaseAdmin
      .from('company_integrations')
      .select('config')
      .eq('company_id', verified.companyId)
      .eq('provider', 'google_calendar')
      .maybeSingle()

    const existingConfig = normalizeGoogleCalendarIntegrationConfig(
      (existing?.config || {}) as Record<string, unknown>
    )

    const secrets = buildGoogleCalendarIntegrationSecrets({
      tokens,
      existing: existingConfig || undefined,
    })

    const { error } = await supabaseAdmin.from('company_integrations').upsert(
      {
        company_id: verified.companyId,
        provider: 'google_calendar',
        status: 'connected',
        config: secrets,
        connected_at: now,
        updated_at: now,
      },
      { onConflict: 'company_id,provider' }
    )

    if (error?.code === '42P01') {
      return settingsRedirect(origin, {
        google_calendar: 'error',
        message: 'Integrations table missing. Run supabase/integrations-schema.sql.',
      })
    }

    if (error) {
      throw error
    }

    return settingsRedirect(origin, { google_calendar: 'connected' })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Google Calendar connection failed'
    console.error('google-calendar callback error:', error)
    return settingsRedirect(origin, {
      google_calendar: 'error',
      message,
    })
  }
}