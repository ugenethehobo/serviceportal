import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import type { parseStripeWebhookRequest as ParseFn } from '@/lib/stripe-webhook'

describe('stripe-webhook', () => {
  let parseStripeWebhookRequest: typeof ParseFn

  before(async () => {
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_unit'
    ;({ parseStripeWebhookRequest } = await import('@/lib/stripe-webhook'))
  })

  it('rejects webhooks when secret is missing', () => {
    const result = parseStripeWebhookRequest('{}', 'sig_test', undefined)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 400)
      assert.equal(result.error, 'Webhook not configured')
    }
  })

  it('rejects webhooks when signature is missing', () => {
    const result = parseStripeWebhookRequest('{}', null, 'whsec_test')
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 400)
      assert.equal(result.error, 'Webhook not configured')
    }
  })

  it('rejects invalid signatures', () => {
    const result = parseStripeWebhookRequest('not-json', 'sig_bad', 'whsec_test')
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 400)
      assert.equal(result.error, 'Invalid signature')
    }
  })
})