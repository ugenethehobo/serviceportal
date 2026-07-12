import { NextResponse } from 'next/server'
import { QUICKBOOKS_INTEGRATION_ENABLED } from '@/lib/integrations'
import { createSupabaseAdmin } from '@/lib/portal-auth'
import {
  buildQuickBooksIntegrationSecrets,
  exchangeQuickBooksAuthCode,
  verifyQuickBooksOAuthState,
} from '@/lib/quickbooks-oauth'

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

  if (!QUICKBOOKS_INTEGRATION_ENABLED) {
    return settingsRedirect(origin, {
      quickbooks: 'error',
      message: 'QuickBooks integration is not available yet.',
    })
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const realmId = searchParams.get('realmId')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')

  if (oauthError) {
    return settingsRedirect(origin, {
      quickbooks: 'error',
      message: oauthError,
    })
  }

  if (!code || !realmId || !state) {
    return settingsRedirect(origin, {
      quickbooks: 'error',
      message: 'Missing QuickBooks authorization response',
    })
  }

  const verified = verifyQuickBooksOAuthState(state)
  if (!verified) {
    return settingsRedirect(origin, {
      quickbooks: 'error',
      message: 'Invalid or expired QuickBooks OAuth state',
    })
  }

  try {
    const tokens = await exchangeQuickBooksAuthCode(code)
    const secrets = buildQuickBooksIntegrationSecrets({ realmId, tokens })
    const supabaseAdmin = createSupabaseAdmin()
    const now = new Date().toISOString()

    const { error } = await supabaseAdmin.from('company_integrations').upsert(
      {
        company_id: verified.companyId,
        provider: 'quickbooks',
        status: 'connected',
        config: secrets,
        connected_at: now,
        updated_at: now,
      },
      { onConflict: 'company_id,provider' }
    )

    if (error?.code === '42P01') {
      return settingsRedirect(origin, {
        quickbooks: 'error',
        message: 'Integrations table missing. Run supabase/integrations-schema.sql.',
      })
    }

    if (error) {
      throw error
    }

    return settingsRedirect(origin, { quickbooks: 'connected' })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'QuickBooks connection failed'
    console.error('quickbooks callback error:', error)
    return settingsRedirect(origin, {
      quickbooks: 'error',
      message,
    })
  }
}