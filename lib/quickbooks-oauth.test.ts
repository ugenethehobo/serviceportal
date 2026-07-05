import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  createQuickBooksOAuthState,
  sanitizeIntegrationConfigForClient,
  verifyQuickBooksOAuthState,
} from '@/lib/quickbooks-oauth'

const ORIGINAL_ENV = { ...process.env }

before(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
})

after(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('QuickBooks OAuth foundation', () => {
  it('creates and verifies signed OAuth state', () => {
    const state = createQuickBooksOAuthState({
      companyId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
    })

    const verified = verifyQuickBooksOAuthState(state)
    assert.equal(verified?.companyId, '11111111-1111-1111-1111-111111111111')
    assert.equal(verified?.userId, '22222222-2222-2222-2222-222222222222')
  })

  it('rejects tampered OAuth state', () => {
    const state = createQuickBooksOAuthState({
      companyId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
    })

    const tampered = `${state.slice(0, -1)}x`
    assert.equal(verifyQuickBooksOAuthState(tampered), null)
  })

  it('redacts QuickBooks tokens from client-facing config', () => {
    const sanitized = sanitizeIntegrationConfigForClient('quickbooks', {
      realm_id: '12345',
      access_token: 'secret-access',
      refresh_token: 'secret-refresh',
      access_token_expires_at: '2026-07-05T12:00:00.000Z',
    })

    assert.equal(sanitized.realm_id, '12345')
    assert.equal(sanitized.access_token, undefined)
    assert.equal(sanitized.refresh_token, undefined)
    assert.equal(sanitized.access_token_expires_at, '2026-07-05T12:00:00.000Z')
  })
})