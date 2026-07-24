import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatPortalAccessExpiry,
  isPortalAccessExpired,
  portalAccessExpiresAtFromDuration,
} from '@/lib/portal-users'

test('portalAccessExpiresAtFromDuration none is permanent', () => {
  assert.equal(portalAccessExpiresAtFromDuration('none'), null)
})

test('portalAccessExpiresAtFromDuration 7d is about a week ahead', () => {
  const from = new Date('2026-01-01T00:00:00.000Z')
  const expires = portalAccessExpiresAtFromDuration('7d', from)
  assert.ok(expires)
  assert.equal(expires, '2026-01-08T00:00:00.000Z')
})

test('isPortalAccessExpired treats null as never expired', () => {
  assert.equal(isPortalAccessExpired(null), false)
  assert.equal(isPortalAccessExpired(undefined), false)
})

test('isPortalAccessExpired detects past timestamps', () => {
  assert.equal(isPortalAccessExpired('2020-01-01T00:00:00.000Z'), true)
  assert.equal(isPortalAccessExpired('2099-01-01T00:00:00.000Z'), false)
})

test('formatPortalAccessExpiry labels none and expired', () => {
  assert.equal(formatPortalAccessExpiry(null), 'No time limit')
  assert.equal(formatPortalAccessExpiry('2020-01-01T00:00:00.000Z'), 'Expired')
})
