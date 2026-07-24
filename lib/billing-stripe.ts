/**
 * Pure helpers for Stripe Connect job payments (partial PI, refunds, succeed gate).
 * Used by billing-server and API routes; unit-tested without Stripe/DB.
 */

import {
  MONEY_EPS,
  STRIPE_MIN_USD,
  roundMoney,
  validatePaymentAmount,
} from '@/lib/payment-plans'

export type ResolvePiAmountInput = {
  /** Client-requested dollars; omit to default */
  requestedAmount?: number | null
  amountDueNow: number
  maxPayableNow: number
  balanceDue: number
  canPay: boolean
  lineItemCount: number
}

export type ResolvePiAmountResult =
  | { ok: true; amount: number }
  | { ok: false; error: string; status: number }

/**
 * Resolve the dollar amount for a new PaymentIntent.
 * Default: amountDueNow if > 0, else maxPayableNow.
 */
export function resolvePaymentIntentAmount(
  input: ResolvePiAmountInput
): ResolvePiAmountResult {
  if (input.lineItemCount <= 0) {
    return {
      ok: false,
      error: 'Add line items before collecting payment',
      status: 400,
    }
  }
  if (input.balanceDue <= MONEY_EPS) {
    return { ok: false, error: 'No balance due on this job', status: 400 }
  }
  if (!input.canPay) {
    return {
      ok: false,
      error: 'Payment is not available for this job right now',
      status: 400,
    }
  }

  const dueNow = roundMoney(Math.max(0, input.amountDueNow))
  const maxPay = roundMoney(Math.max(0, input.maxPayableNow))
  const defaultAmount = dueNow > MONEY_EPS ? dueNow : maxPay

  const requested =
    input.requestedAmount == null || Number.isNaN(Number(input.requestedAmount))
      ? defaultAmount
      : roundMoney(Number(input.requestedAmount))

  if (!Number.isFinite(requested)) {
    return { ok: false, error: 'Invalid payment amount', status: 400 }
  }

  const validation = validatePaymentAmount({
    amount: requested,
    balanceDue: input.balanceDue,
    maxPayableNow: maxPay,
    allowPayAhead: true, // maxPayableNow already encodes allowPayAhead
    minCardAmount: STRIPE_MIN_USD,
  })

  if (!validation.ok) {
    return { ok: false, error: validation.error, status: 400 }
  }

  return { ok: true, amount: requested }
}

/**
 * Ledger remaining after refunds using Stripe charge totals (cumulative-safe).
 * remaining = chargeAmount - amountRefundedCumulative
 */
export function computePaymentAmountAfterRefund(
  chargeAmountDollars: number,
  amountRefundedCumulativeDollars: number
): { remaining: number; fullyRefunded: boolean } {
  const charge = roundMoney(Math.max(0, chargeAmountDollars))
  const refunded = roundMoney(Math.max(0, amountRefundedCumulativeDollars))
  const remaining = roundMoney(Math.max(0, charge - refunded))
  return {
    remaining,
    fullyRefunded: remaining <= MONEY_EPS,
  }
}

/** Client-facing copy when succeed-time ledger gate refuses a Stripe payment (K21). */
export const LEDGER_OVERPAYMENT_CLIENT_MESSAGE =
  'This payment could not be recorded because it would exceed the job balance. Contact the business for a refund if you were charged.'

/** Ops guidance logged with LEDGER_OVERPAYMENT — no auto-refund in v1. */
export const LEDGER_OVERPAYMENT_OPS_ACTION = 'manual_refund_in_stripe_dashboard'

/**
 * Succeed-time gate: refuse if amount would exceed live ledger balance.
 */
export function assertStripeAmountFitsLedger(
  amount: number,
  balanceDue: number
):
  | { ok: true }
  | { ok: false; code: 'LEDGER_OVERPAYMENT'; amount: number; balanceDue: number } {
  const a = roundMoney(amount)
  const due = roundMoney(balanceDue)
  if (a > due + MONEY_EPS) {
    return { ok: false, code: 'LEDGER_OVERPAYMENT', amount: a, balanceDue: due }
  }
  return { ok: true }
}

export function paymentIntentIdempotencyKey(input: {
  scheduleId: string
  amountCents: number
  installmentId?: string | null
  nowMs?: number
}): string {
  const bucket = Math.floor((input.nowMs ?? Date.now()) / 30_000)
  const inst = input.installmentId || 'none'
  return `pi_${input.scheduleId}_${input.amountCents}_${inst}_${bucket}`
}
