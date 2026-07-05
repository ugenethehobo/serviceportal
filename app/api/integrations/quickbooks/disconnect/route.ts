import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/portal-auth'
import {
  assertCompanyAdminForIntegrations,
  getIntegrationOAuthUser,
} from '@/lib/integration-oauth-auth'
import { revokeQuickBooksToken } from '@/lib/quickbooks-oauth'

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
    const { data: row } = await supabaseAdmin
      .from('company_integrations')
      .select('config')
      .eq('company_id', access.companyId)
      .eq('provider', 'quickbooks')
      .maybeSingle()

    const refreshToken =
      row?.config &&
      typeof row.config === 'object' &&
      typeof (row.config as Record<string, unknown>).refresh_token === 'string'
        ? ((row.config as Record<string, unknown>).refresh_token as string)
        : null

    if (refreshToken) {
      await revokeQuickBooksToken(refreshToken)
    }

    const now = new Date().toISOString()
    const { error } = await supabaseAdmin.from('company_integrations').upsert(
      {
        company_id: access.companyId,
        provider: 'quickbooks',
        status: 'disconnected',
        config: {},
        connected_at: null,
        updated_at: now,
      },
      { onConflict: 'company_id,provider' }
    )

    if (error?.code === '42P01') {
      return NextResponse.json(
        {
          error: 'Integrations are not enabled yet. Run supabase/integrations-schema.sql.',
        },
        { status: 503 }
      )
    }

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect QuickBooks'
    console.error('quickbooks disconnect error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}