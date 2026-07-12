import { NextResponse } from 'next/server'
import { QUICKBOOKS_INTEGRATION_ENABLED } from '@/lib/integrations'
import {
  assertCompanyAdminForIntegrations,
  getIntegrationOAuthUser,
} from '@/lib/integration-oauth-auth'
import {
  createQuickBooksOAuthState,
  getQuickBooksAuthorizeUrl,
  isQuickBooksOAuthConfigured,
} from '@/lib/quickbooks-oauth'

export async function POST() {
  try {
    if (!QUICKBOOKS_INTEGRATION_ENABLED) {
      return NextResponse.json(
        { error: 'QuickBooks integration is not available yet.' },
        { status: 503 }
      )
    }

    if (!isQuickBooksOAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            'QuickBooks OAuth is not configured. Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET.',
        },
        { status: 503 }
      )
    }

    const user = await getIntegrationOAuthUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await assertCompanyAdminForIntegrations(user.id)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const state = createQuickBooksOAuthState({
      companyId: access.companyId,
      userId: access.userId,
    })

    return NextResponse.json({ url: getQuickBooksAuthorizeUrl(state) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start QuickBooks OAuth'
    console.error('quickbooks connect error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}