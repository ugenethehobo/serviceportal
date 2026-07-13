export type EnvCheckStatus = 'ok' | 'missing'

export const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_ADMIN_EMAIL',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'CRON_SECRET',
  'STRIPE_PLATFORM_PRICE_BASIC',
  'STRIPE_PLATFORM_PRICE_PRO',
] as const

export const PRODUCTION_ONLY_ENV_VARS = [
  'QUICKBOOKS_OAUTH_STATE_SECRET',
  'GOOGLE_CALENDAR_OAUTH_STATE_SECRET',
] as const

export const RECOMMENDED_ENV_VARS = [
  'STRIPE_BILLING_WEBHOOK_SECRET',
  'QUICKBOOKS_CLIENT_ID',
  'QUICKBOOKS_CLIENT_SECRET',
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
] as const

/** Subset probed by /api/health (no secret values exposed). */
export const HEALTH_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'CRON_SECRET',
  'STRIPE_PLATFORM_PRICE_BASIC',
  'STRIPE_PLATFORM_PRICE_PRO',
] as const

export const HEALTH_RECOMMENDED_ENV_VARS = ['STRIPE_BILLING_WEBHOOK_SECRET'] as const

export function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim())
}

export function getEnvCheckStatuses(
  names: readonly string[]
): Record<string, EnvCheckStatus> {
  return Object.fromEntries(
    names.map((name) => [name, hasEnv(name) ? 'ok' : 'missing'])
  )
}

export function isLocalAppUrl(): boolean {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? ''
  return !value || value.includes('localhost') || value.includes('127.0.0.1')
}

export function isStripeTestMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
  return key.startsWith('sk_test_')
}

export type EnvValidationResult = {
  ok: boolean
  missingRequired: string[]
  missingProduction: string[]
  missingRecommended: string[]
  warnings: string[]
  checks: Record<string, EnvCheckStatus>
}

export function validateEnvironment(options?: {
  production?: boolean
}): EnvValidationResult {
  const production = options?.production ?? false
  const checks = getEnvCheckStatuses([
    ...REQUIRED_ENV_VARS,
    ...(production ? PRODUCTION_ONLY_ENV_VARS : []),
    ...RECOMMENDED_ENV_VARS,
  ])

  const missingRequired = REQUIRED_ENV_VARS.filter((name) => !hasEnv(name))
  const missingProduction = production
    ? PRODUCTION_ONLY_ENV_VARS.filter((name) => !hasEnv(name))
    : []
  const missingRecommended = RECOMMENDED_ENV_VARS.filter((name) => !hasEnv(name))

  const warnings: string[] = []
  if (production && isLocalAppUrl()) {
    warnings.push('NEXT_PUBLIC_APP_URL still points at localhost — set your production URL.')
  }
  if (production && isStripeTestMode()) {
    warnings.push('STRIPE_SECRET_KEY is test mode — use live keys for production billing.')
  }

  return {
    ok: missingRequired.length === 0 && missingProduction.length === 0,
    missingRequired: [...missingRequired],
    missingProduction: [...missingProduction],
    missingRecommended: [...missingRecommended],
    warnings,
    checks,
  }
}