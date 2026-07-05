import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export const QUICKBOOKS_OAUTH_SCOPES = ['com.intuit.quickbooks.accounting'] as const

export type QuickBooksOAuthEnvironment = 'sandbox' | 'production'

export type QuickBooksTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  x_refresh_token_expires_in?: number
  token_type?: string
}

export type QuickBooksIntegrationSecrets = {
  realm_id: string
  access_token: string
  refresh_token: string
  access_token_expires_at: string
  refresh_token_expires_at: string | null
}

const SENSITIVE_CONFIG_KEYS = new Set(['access_token', 'refresh_token'])

function getQuickBooksEnvironment(): QuickBooksOAuthEnvironment {
  const value = process.env.QUICKBOOKS_ENVIRONMENT?.trim().toLowerCase()
  return value === 'production' ? 'production' : 'sandbox'
}

function getOAuthStateSecret(): string | null {
  return (
    process.env.QUICKBOOKS_OAUTH_STATE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null
  )
}

export function isQuickBooksOAuthConfigured(): boolean {
  return Boolean(
    process.env.QUICKBOOKS_CLIENT_ID?.trim() &&
      process.env.QUICKBOOKS_CLIENT_SECRET?.trim() &&
      getQuickBooksRedirectUri()
  )
}

export function getQuickBooksRedirectUri(): string | null {
  const explicit = process.env.QUICKBOOKS_REDIRECT_URI?.trim()
  if (explicit) return explicit

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (!appUrl) return null

  return `${appUrl}/api/integrations/quickbooks/callback`
}

export function getQuickBooksAuthorizeUrl(state: string): string {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim()
  const redirectUri = getQuickBooksRedirectUri()
  if (!clientId || !redirectUri) {
    throw new Error('QuickBooks OAuth is not configured')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: QUICKBOOKS_OAUTH_SCOPES.join(' '),
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  })

  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`
}

export function createQuickBooksOAuthState(input: {
  companyId: string
  userId: string
  expiresInMs?: number
}): string {
  const secret = getOAuthStateSecret()
  if (!secret) {
    throw new Error('QuickBooks OAuth state secret is not configured')
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

export function verifyQuickBooksOAuthState(state: string): {
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

async function exchangeQuickBooksToken(body: URLSearchParams): Promise<QuickBooksTokenResponse> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim()
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    throw new Error('QuickBooks OAuth is not configured')
  }

  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })

  const data = (await response.json().catch(() => null)) as
    | QuickBooksTokenResponse
    | { error?: string; error_description?: string }
    | null

  if (!response.ok || !data || !('access_token' in data)) {
    const message =
      data && 'error_description' in data && data.error_description
        ? data.error_description
        : data && 'error' in data && data.error
          ? data.error
          : `QuickBooks token exchange failed (${response.status})`
    throw new Error(message)
  }

  return data
}

export async function exchangeQuickBooksAuthCode(code: string): Promise<QuickBooksTokenResponse> {
  const redirectUri = getQuickBooksRedirectUri()
  if (!redirectUri) {
    throw new Error('QuickBooks redirect URI is not configured')
  }

  return exchangeQuickBooksToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    })
  )
}

export async function refreshQuickBooksAccessToken(
  refreshToken: string
): Promise<QuickBooksTokenResponse> {
  return exchangeQuickBooksToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
  )
}

export async function revokeQuickBooksToken(token: string): Promise<void> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim()
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return

  await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ token }),
  }).catch(() => {
    // Best-effort revoke; local disconnect still proceeds.
  })
}

export function buildQuickBooksIntegrationSecrets(input: {
  realmId: string
  tokens: QuickBooksTokenResponse
}): QuickBooksIntegrationSecrets {
  const now = Date.now()
  const accessExpiresAt = new Date(now + input.tokens.expires_in * 1000).toISOString()
  const refreshExpiresAt = input.tokens.x_refresh_token_expires_in
    ? new Date(now + input.tokens.x_refresh_token_expires_in * 1000).toISOString()
    : null

  return {
    realm_id: input.realmId,
    access_token: input.tokens.access_token,
    refresh_token: input.tokens.refresh_token,
    access_token_expires_at: accessExpiresAt,
    refresh_token_expires_at: refreshExpiresAt,
  }
}

export function getQuickBooksRealmId(config: Record<string, unknown>): string | null {
  return typeof config.realm_id === 'string' && config.realm_id.trim()
    ? config.realm_id.trim()
    : null
}

export function sanitizeIntegrationConfigForClient(
  provider: 'quickbooks' | 'google_calendar' | 'zapier',
  config: Record<string, unknown>
): Record<string, unknown> {
  if (provider !== 'quickbooks') return config

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (SENSITIVE_CONFIG_KEYS.has(key)) continue
    sanitized[key] = value
  }
  return sanitized
}

export function getQuickBooksEnvironmentLabel(): string {
  return getQuickBooksEnvironment() === 'production' ? 'Production' : 'Sandbox'
}