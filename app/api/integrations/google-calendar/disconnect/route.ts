import { NextResponse } from 'next/server'
import {
  assertCompanyAdminForIntegrations,
  getIntegrationOAuthUser,
} from '@/lib/integration-oauth-auth'
import { createSupabaseAdmin } from '@/lib/portal-auth'
import {
  normalizeGoogleCalendarIntegrationConfig,
  revokeGoogleCalendarToken,
} from '@/lib/google-calendar-oauth'

export async function POST() {
  try {
    const user = await getIntegrationOAuthUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await assertCompanyAdminForIntegrations(user.id)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: integration } = await supabaseAdmin
      .from('company_integrations')
      .select('config')
      .eq('company_id', access.companyId)
      .eq('provider', 'google_calendar')
      .maybeSingle()

    const config = normalizeGoogleCalendarIntegrationConfig(
      (integration?.config || {}) as Record<string, unknown>
    )

    if (config?.refresh_token) {
      await revokeGoogleCalendarToken(config.refresh_token)
    } else if (config?.access_token) {
      await revokeGoogleCalendarToken(config.access_token)
    }

    const { error } = await supabaseAdmin.from('company_integrations').upsert(
      {
        company_id: access.companyId,
        provider: 'google_calendar',
        status: 'disconnected',
        config: {
          sync_enabled: false,
          calendar_id: null,
          calendar_summary: null,
        },
        connected_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,provider' }
    )

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to disconnect Google Calendar'
    console.error('google-calendar disconnect error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}