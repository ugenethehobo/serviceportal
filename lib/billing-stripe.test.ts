import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertStripeAmountFitsLedger,
  computePaymentAmountAfterRefund,
  LEDGER_OVERPAYMENT_CLIENT_MESSAGE,
  LEDGER_OVERPAYMENT_OPS_ACTION,
  paymentIntentIdempotencyKey,
  resolvePaymentIntentAmount,
} from '@/lib/billing-stripe'

describe('billing-stripe / resolvePaymentIntentAmount', () => {
  it('defaults to amountDueNow when present', () => {
    const r = resolvePaymentIntentAmount({
      amountDueNow: 300,
      maxPayableNow: 1000,
      balanceDue: 1000,
      canPay: true,
      lineItemCount: 1,
    })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.amount, 300)
  })

  it('accepts optional partial amount within maxPayableNow', () => {
    const r = resolvePaymentIntentAmount({
      requestedAmount: 150,
      amountDueNow: 300,
      maxPayableNow: 1000,
      balanceDue: 1000,
      canPay: true,
      lineItemCount: 1,
    })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.amount, 150)
  })

  it('rejects amount below Stripe $0.50 even when it is full residual', () => {
    const r = resolvePaymentIntentAmount({
      requestedAmount: 0.4,
      amountDueNow: 0.4,
      maxPayableNow: 0.4,
      balanceDue: 0.4,
      canPay: true,
      lineItemCount: 1,
    })
    assert.equal(r.ok, false)
  })

  it('rejects when !canPay', () => {
    const r = resolvePaymentIntentAmount({
      amountDueNow: 0,
      maxPayableNow: 0,
      balanceDue: 500,
      canPay: false,
      lineItemCount: 1,
    })
    assert.equal(r.ok, false)
  })

  it('rejects amount above balanceDue', () => {
    const r = resolvePaymentIntentAmount({
      requestedAmount: 600,
      amountDueNow: 500,
      maxPayableNow: 500,
      balanceDue: 500,
      canPay: true,
      lineItemCount: 1,
    })
    assert.equal(r.ok, false)
  })
})

describe('billing-stripe / succeed-time ledger gate', () => {
  it('allows amount within balance', () => {
    assert.equal(assertStripeAmountFitsLedger(400, 500).ok, true)
  })

  it('refuses overpayment (double PI race)', () => {
    const r = assertStripeAmountFitsLedger(400, 100)
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.equal(r.code, 'LEDGER_OVERPAYMENT')
      assert.equal(r.balanceDue, 100)
    }
  })

  it('exports stable client-facing overpayment copy', () => {
    assert.match(LEDGER_OVERPAYMENT_CLIENT_MESSAGE, /exceed the job balance/i)
    assert.match(LEDGER_OVERPAYMENT_CLIENT_MESSAGE, /refund/i)
    assert.equal(LEDGER_OVERPAYMENT_OPS_ACTION, 'manual_refund_in_stripe_dashboard')
  })
})

describe('billing-stripe / refund cumulative math', () => {
  it('handles successive partial refunds using charge totals', () => {
    // Charge $100; first refund $30 cumulative → remaining 70
    const first = computePaymentAmountAfterRefund(100, 30)
    assert.equal(first.remaining, 70)
    assert.equal(first.fullyRefunded, false)

    // Second refund brings cumulative to $50 → remaining 50 (not 70-50=20)
    const second = computePaymentAmountAfterRefund(100, 50)
    assert.equal(second.remaining, 50)
    assert.equal(second.fullyRefunded, false)

    const full = computePaymentAmountAfterRefund(100, 100)
    assert.equal(full.fullyRefunded, true)
    assert.equal(full.remaining, 0)
  })
})

describe('billing-stripe / idempotency key', () => {
  it('buckets by 30s window', () => {
    // Align to start of a 30s bucket so +10s stays inside
    const bucketStart = Math.floor(1_700_000_000_000 / 30_000) * 30_000
    const a = paymentIntentIdempotencyKey({
      scheduleId: 'job-1',
      amountCents: 30000,
      nowMs: bucketStart + 1_000,
    })
    const b = paymentIntentIdempotencyKey({
      scheduleId: 'job-1',
      amountCents: 30000,
      nowMs: bucketStart + 20_000,
    })
    const c = paymentIntentIdempotencyKey({
      scheduleId: 'job-1',
      amountCents: 30000,
      nowMs: bucketStart + 40_000,
    })
    assert.equal(a, b)
    assert.notEqual(a, c)
  })
})
