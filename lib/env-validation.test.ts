import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  getEnvCheckStatuses,
  hasEnv,
  validateEnvironment,
} from '@/lib/env-validation'

const ORIGINAL_ENV = { ...process.env }

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, ORIGINAL_ENV)
}

describe('env-validation', () => {
  afterEach(() => {
    restoreEnv()
  })

  it('treats empty and whitespace values as missing', () => {
    process.env.TEST_ENV_VAR = '   '
    assert.equal(hasEnv('TEST_ENV_VAR'), false)

    process.env.TEST_ENV_VAR = 'value'
    assert.equal(hasEnv('TEST_ENV_VAR'), true)
  })

  it('reports missing required variables', () => {
    delete process.env.CRON_SECRET
    const result = validateEnvironment()
    assert.equal(result.ok, false)
    assert.ok(result.missingRequired.includes('CRON_SECRET'))
    assert.equal(result.checks.CRON_SECRET, 'missing')
  })

  it('requires production-only secrets in production mode', () => {
    for (const name of [
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
    ]) {
      process.env[name] = 'set'
    }
    delete process.env.QUICKBOOKS_OAUTH_STATE_SECRET

    const result = validateEnvironment({ production: true })
    assert.equal(result.ok, false)
    assert.ok(result.missingProduction.includes('QUICKBOOKS_OAUTH_STATE_SECRET'))
  })

  it('warns about localhost app URL in production', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    const result = validateEnvironment({ production: true })
    assert.ok(result.warnings.some((warning) => warning.includes('localhost')))
  })

  it('builds health check status maps', () => {
    process.env.RESEND_API_KEY = 're_test'
    const checks = getEnvCheckStatuses(['RESEND_API_KEY', 'CRON_SECRET'])
    assert.equal(checks.RESEND_API_KEY, 'ok')
    assert.equal(checks.CRON_SECRET, 'missing')
  })
})