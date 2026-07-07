import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export const GOOGLE_CALENDAR_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
] as const

export type GoogleCalendarTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
  scope?: string
}

export type GoogleCalendarIntegrationSecrets = {
  access_token: string
  refresh_token: string
  access_token_expires_at: string
  sync_enabled: boolean
  calendar_id: string | null
  calendar_summary: string | null
}

export type GoogleCalendarListEntry = {
  id: string
  summary: string
  primary?: boolean
}

const SENSITIVE_CONFIG_KEYS = new Set(['access_token', 'refresh_token'])

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  )
}

function getOAuthStateSecret(): string | null {
  const dedicated = process.env.GOOGLE_CALENDAR_OAUTH_STATE_SECRET?.trim()
  if (dedicated) return dedicated

  if (isProductionRuntime()) {
    return null
  }

  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
}

export function isGoogleCalendarOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() &&
      getGoogleCalendarRedirectUri()
  )
}

export function getGoogleCalendarRedirectUri(): string | null {
  const explicit = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim()
  if (explicit) return explicit

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (!appUrl) return null

  return `${appUrl}/api/integrations/google-calendar/callback`
}

export function getGoogleCalendarAuthorizeUrl(state: string): string {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()
  const redirectUri = getGoogleCalendarRedirectUri()
  if (!clientId || !redirectUri) {
    throw new Error('Google Calendar OAuth is not configured')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_OAUTH_SCOPES.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function createGoogleCalendarOAuthState(input: {
  companyId: string
  userId: string
  expiresInMs?: number
}): string {
  const secret = getOAuthStateSecret()
  if (!secret) {
    throw new Error('Google Calendar OAuth state secret is not configured')
  }

  const payload = {
    companyId: input.companyId,
    userId: input.userId,
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + (input.expiresInMs ?? 10 * 60 * 1000),
  }

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyGoogleCalendarOAuthState(state: string): {
  companyId: string
  userId: string
} | null {
  const secret = getOAuthStateSecret()
  if (!secret) return null

  const [encoded, signature] = state.split('.')
  if (!encoded || !signature) return null

  const expected = createHmac('sha256', secret).update(encoded).digest('base64url')
  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      companyId?: string
      userId?: string
      exp?: number
    }

    if (!payload.companyId || !payload.userId || !payload.exp) return null
    if (Date.now() > payload.exp) return null

    return { companyId: payload.companyId, userId: payload.userId }
  } catch {
    return null
  }
}

async function exchangeGoogleCalendarToken(
  body: URLSearchParams
): Promise<GoogleCalendarTokenResponse> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    throw new Error('Google Calendar OAuth is not configured')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const data = (await response.json().catch(() => null)) as
    | GoogleCalendarTokenResponse
    | { error?: string; error_description?: string }
    | null

  if (!response.ok || !data || !('access_token' in data)) {
    const message =
      data && 'error_description' in data && data.error_description
        ? data.error_description
        : data && 'error' in data && data.error
          ? data.error
          : `Google token exchange failed (${response.status})`
    throw new Error(message)
  }

  return data
}

export async function exchangeGoogleCalendarAuthCode(
  code: string
): Promise<GoogleCalendarTokenResponse> {
  const redirectUri = getGoogleCalendarRedirectUri()
  if (!redirectUri) {
    throw new Error('Google Calendar redirect URI is not configured')
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    throw new Error('Google Calendar OAuth is not configured')
  }

  return exchangeGoogleCalendarToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    })
  )
}

export async function refreshGoogleCalendarAccessToken(
  refreshToken: string
): Promise<GoogleCalendarTokenResponse> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    throw new Error('Google Calendar OAuth is not configured')
  }

  return exchangeGoogleCalendarToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    })
  )
}

export async function revokeGoogleCalendarToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).catch(() => {
    // Best-effort revoke; local disconnect still proceeds.
  })
}

export function buildGoogleCalendarIntegrationSecrets(input: {
  tokens: GoogleCalendarTokenResponse
  existing?: Partial<GoogleCalendarIntegrationSecrets>
}): GoogleCalendarIntegrationSecrets {
  const now = Date.now()
  const refreshToken =
    input.tokens.refresh_token || input.existing?.refresh_token?.trim() || ''

  if (!refreshToken) {
    throw new Error('Google did not return a refresh token. Reconnect with consent.')
  }

  return {
    access_token: input.tokens.access_token,
    refresh_token: refreshToken,
    access_token_expires_at: new Date(now + input.tokens.expires_in * 1000).toISOString(),
    sync_enabled: input.existing?.sync_enabled ?? false,
    calendar_id: input.existing?.calendar_id ?? null,
    calendar_summary: input.existing?.calendar_summary ?? null,
  }
}

export function normalizeGoogleCalendarIntegrationConfig(
  config: Record<string, unknown>
): GoogleCalendarIntegrationSecrets | null {
  const accessToken =
    typeof config.access_token === 'string' && config.access_token.trim()
      ? config.access_token.trim()
      : null
  const refreshToken =
    typeof config.refresh_token === 'string' && config.refresh_token.trim()
      ? config.refresh_token.trim()
      : null

  if (!accessToken || !refreshToken) return null

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    access_token_expires_at:
      typeof config.access_token_expires_at === 'string'
        ? config.access_token_expires_at
        : new Date(0).toISOString(),
    sync_enabled: config.sync_enabled === true,
    calendar_id:
      typeof config.calendar_id === 'string' && config.calendar_id.trim()
        ? config.calendar_id.trim()
        : null,
    calendar_summary:
      typeof config.calendar_summary === 'string' && config.calendar_summary.trim()
        ? config.calendar_summary.trim()
        : null,
  }
}

export function getGoogleCalendarSyncSettings(config: Record<string, unknown>) {
  const normalized = normalizeGoogleCalendarIntegrationConfig(config)
  return {
    sync_enabled: normalized?.sync_enabled ?? false,
    calendar_id: normalized?.calendar_id ?? null,
    calendar_summary: normalized?.calendar_summary ?? null,
  }
}

export function sanitizeGoogleCalendarConfigForClient(
  config: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (SENSITIVE_CONFIG_KEYS.has(key)) continue
    sanitized[key] = value
  }
  return sanitized
}