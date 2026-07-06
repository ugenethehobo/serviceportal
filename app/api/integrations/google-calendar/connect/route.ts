import { NextResponse } from 'next/server'
import {
  assertCompanyAdminForIntegrations,
  getIntegrationOAuthUser,
} from '@/lib/integration-oauth-auth'
import {
  createGoogleCalendarOAuthState,
  getGoogleCalendarAuthorizeUrl,
  isGoogleCalendarOAuthConfigured,
} from '@/lib/google-calendar-oauth'

export async function POST() {
  try {
    if (!isGoogleCalendarOAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            'Google Calendar OAuth is not configured. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET.',
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

    const state = createGoogleCalendarOAuthState({
      companyId: access.companyId,
      userId: access.userId,
    })

    return NextResponse.json({ url: getGoogleCalendarAuthorizeUrl(state) })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to start Google Calendar OAuth'
    console.error('google-calendar connect error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}