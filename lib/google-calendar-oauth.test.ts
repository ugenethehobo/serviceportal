import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  createGoogleCalendarOAuthState,
  normalizeGoogleCalendarIntegrationConfig,
  sanitizeGoogleCalendarConfigForClient,
  verifyGoogleCalendarOAuthState,
} from '@/lib/google-calendar-oauth'

const ORIGINAL_ENV = { ...process.env }

before(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
})

after(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('Google Calendar OAuth foundation', () => {
  it('creates and verifies signed OAuth state', () => {
    const state = createGoogleCalendarOAuthState({
      companyId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
    })

    const verified = verifyGoogleCalendarOAuthState(state)
    assert.equal(verified?.companyId, '11111111-1111-1111-1111-111111111111')
    assert.equal(verified?.userId, '22222222-2222-2222-2222-222222222222')
  })

  it('normalizes integration config and sync settings', () => {
    const config = normalizeGoogleCalendarIntegrationConfig({
      access_token: 'access',
      refresh_token: 'refresh',
      access_token_expires_at: '2026-07-05T12:00:00.000Z',
      sync_enabled: true,
      calendar_id: 'primary',
      calendar_summary: 'Work',
    })

    assert.equal(config?.sync_enabled, true)
    assert.equal(config?.calendar_id, 'primary')
    assert.equal(config?.calendar_summary, 'Work')
  })

  it('redacts Google tokens from client-facing config', () => {
    const sanitized = sanitizeGoogleCalendarConfigForClient({
      sync_enabled: true,
      calendar_id: 'primary',
      access_token: 'secret-access',
      refresh_token: 'secret-refresh',
    })

    assert.equal(sanitized.sync_enabled, true)
    assert.equal(sanitized.calendar_id, 'primary')
    assert.equal(sanitized.access_token, undefined)
    assert.equal(sanitized.refresh_token, undefined)
  })
})