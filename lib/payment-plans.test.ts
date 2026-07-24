import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyAllFutureInstance,
  emptyAllFutureCounts,
  formatAllFutureApplyToast,
  formatInstallmentStatusLabel,
  tallyAllFutureDecision,
  allocatePaymentsToInstallments,
  buildPlanProgressSummary,
  computeCanPay,
  computeImplicitFullBalancePayable,
  computePlanPayable,
  expandTemplate,
  isInstallmentCollectible,
  normalizeTemplate,
  parseCompanyJobPaymentSettings,
  rebalanceInstallments,
  rematerializeInstallments,
  roundMoney,
  shouldShowInvoiceInstallmentSchedule,
  sortPaymentsForAllocation,
  toInvoiceInstallmentRows,
  validatePaymentAmount,
  type BillingInstallment,
  type PaymentForAllocation,
  type InstallmentShare,
  STRIPE_MIN_USD,
} from '@/lib/payment-plans'

function inst(
  partial: Partial<BillingInstallment> & Pick<BillingInstallment, 'id' | 'key' | 'sequence' | 'amount_due'>
): BillingInstallment {
  return {
    schedule_id: 'job-1',
    job_payment_plan_id: 'plan-1',
    client_id: 'client-1',
    company_id: 'co-1',
    label: partial.label || partial.key,
    due_date: null,
    collectible_policy: partial.collectible_policy || { when: 'anytime' },
    status: partial.status || 'pending',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...partial,
  }
}

function pay(
  partial: Partial<PaymentForAllocation> & Pick<PaymentForAllocation, 'id' | 'amount'>
): PaymentForAllocation {
  return {
    payment_date: '2026-07-01',
    created_at: '2026-07-01T12:00:00.000Z',
    installment_id: null,
    ...partial,
  }
}

describe('payment-plans / settings', () => {
  it('defaults empty company settings to full_balance', () => {
    const s = parseCompanyJobPaymentSettings({})
    assert.equal(s.defaultPlan.type, 'full_balance')
    assert.equal(s.defaultPlan.allowPayAhead, true)
  })

  it('normalizes deposit_remainder defaults', () => {
    const t = normalizeTemplate({ version: 1, type: 'deposit_remainder' })
    assert.equal(t.deposit?.mode, 'percent')
  })
})

describe('payment-plans / expandTemplate', () => {
  const visit = new Date('2026-07-15T15:00:00.000Z')

  it('expands full_balance', () => {
    const rows = expandTemplate({ version: 1, type: 'full_balance' }, 250, visit)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].key, 'balance')
    assert.equal(rows[0].amount_due, 250)
  })

  it('expands deposit_remainder 50%', () => {
    const rows = expandTemplate(
      {
        version: 1,
        type: 'deposit_remainder',
        deposit: { mode: 'percent', percent: 50 },
      },
      1000,
      visit
    )
    assert.equal(rows[0].key, 'deposit')
    assert.equal(rows[0].amount_due, 500)
    assert.equal(rows[1].key, 'remainder')
    assert.equal(rows[1].amount_due, 500)
    assert.equal(rows[0].collectible_policy.when, 'anytime')
  })

  it('expands custom with remainder absorbing cents', () => {
    const rows = expandTemplate(
      {
        version: 1,
        type: 'custom_installments',
        installments: [
          {
            key: 'a',
            label: 'A',
            share: { mode: 'percent', percent: 33 },
            collectible: { when: 'anytime' },
          },
          {
            key: 'b',
            label: 'B',
            share: { mode: 'remainder' },
            collectible: { when: 'on_or_after_visit_start' },
          },
        ],
      },
      100,
      visit
    )
    assert.equal(rows[0].amount_due, 33)
    assert.equal(rows[1].amount_due, 67)
  })
})

describe('payment-plans / allocation FIFO', () => {
  it('sorts payments ascending by date, created_at, id', () => {
    const sorted = sortPaymentsForAllocation([
      pay({ id: 'c', amount: 1, payment_date: '2026-07-02', created_at: '2026-07-02T10:00:00.000Z' }),
      pay({ id: 'a', amount: 1, payment_date: '2026-07-01', created_at: '2026-07-01T10:00:00.000Z' }),
      pay({ id: 'b', amount: 1, payment_date: '2026-07-01', created_at: '2026-07-01T09:00:00.000Z' }),
    ])
    assert.deepEqual(
      sorted.map((p) => p.id),
      ['b', 'a', 'c']
    )
  })

  it('FIFO unlinked payments across installments', () => {
    const installments = [
      inst({ id: 'i1', key: 'deposit', sequence: 1, amount_due: 300 }),
      inst({ id: 'i2', key: 'remainder', sequence: 2, amount_due: 700 }),
    ]
    const { allocatedById, statuses } = allocatePaymentsToInstallments(installments, [
      pay({ id: 'p1', amount: 300 }),
      pay({ id: 'p2', amount: 200 }),
    ])
    assert.equal(allocatedById.get('i1'), 300)
    assert.equal(allocatedById.get('i2'), 200)
    assert.equal(statuses.get('i1'), 'paid')
    assert.equal(statuses.get('i2'), 'partial')
  })

  it('explicit link then spill FIFO', () => {
    const installments = [
      inst({ id: 'i1', key: 'deposit', sequence: 1, amount_due: 300 }),
      inst({ id: 'i2', key: 'remainder', sequence: 2, amount_due: 700 }),
    ]
    const { allocatedById } = allocatePaymentsToInstallments(installments, [
      pay({ id: 'p1', amount: 500, installment_id: 'i1' }),
    ])
    assert.equal(allocatedById.get('i1'), 300)
    assert.equal(allocatedById.get('i2'), 200)
  })
})

describe('payment-plans / rebalance freeze', () => {
  it('deposit 30% + remainder: percent is of job total, not 100% of open pool', () => {
    const installments = [
      inst({ id: 'i1', key: 'deposit', sequence: 1, amount_due: 0 }),
      inst({ id: 'i2', key: 'remainder', sequence: 2, amount_due: 0 }),
    ]
    const shares = new Map<string, InstallmentShare>([
      ['deposit', { mode: 'percent', percent: 30 }],
      ['remainder', { mode: 'remainder' }],
    ])
    const result = rebalanceInstallments({
      installments,
      payments: [],
      totalCharged: 1000,
      sharesByKey: shares,
    })
    assert.equal(result.installments.find((i) => i.id === 'i1')!.amount_due, 300)
    assert.equal(result.installments.find((i) => i.id === 'i2')!.amount_due, 700)
    assert.equal(result.installments.find((i) => i.id === 'i2')!.status, 'pending')
    assert.equal(result.needsAttention, false)
  })

  it('custom intervals: multiple percent shares leave remainder unpaid share', () => {
    const installments = [
      inst({ id: 'i1', key: 'phase1', sequence: 1, amount_due: 0 }),
      inst({ id: 'i2', key: 'phase2', sequence: 2, amount_due: 0 }),
      inst({ id: 'i3', key: 'final', sequence: 3, amount_due: 0 }),
    ]
    const shares = new Map<string, InstallmentShare>([
      ['phase1', { mode: 'percent', percent: 25 }],
      ['phase2', { mode: 'percent', percent: 25 }],
      ['final', { mode: 'remainder' }],
    ])
    const result = rebalanceInstallments({
      installments,
      payments: [],
      totalCharged: 1000,
      sharesByKey: shares,
    })
    assert.equal(result.installments.find((i) => i.id === 'i1')!.amount_due, 250)
    assert.equal(result.installments.find((i) => i.id === 'i2')!.amount_due, 250)
    assert.equal(result.installments.find((i) => i.id === 'i3')!.amount_due, 500)
    assert.equal(result.installments.find((i) => i.id === 'i3')!.status, 'pending')
  })

  it('custom intervals: fixed + percent + remainder match expandTemplate', () => {
    const installments = [
      inst({ id: 'i1', key: 'retainer', sequence: 1, amount_due: 0 }),
      inst({ id: 'i2', key: 'mid', sequence: 2, amount_due: 0 }),
      inst({ id: 'i3', key: 'final', sequence: 3, amount_due: 0 }),
    ]
    const shares = new Map<string, InstallmentShare>([
      ['retainer', { mode: 'fixed', amount: 100 }],
      ['mid', { mode: 'percent', percent: 40 }],
      ['final', { mode: 'remainder' }],
    ])
    const result = rebalanceInstallments({
      installments,
      payments: [],
      totalCharged: 1000,
      sharesByKey: shares,
    })
    assert.equal(result.installments.find((i) => i.id === 'i1')!.amount_due, 100)
    assert.equal(result.installments.find((i) => i.id === 'i2')!.amount_due, 400)
    assert.equal(result.installments.find((i) => i.id === 'i3')!.amount_due, 500)
  })

  it('rematerialize deposit_remainder percent matches expand preview', () => {
    let n = 0
    const result = rematerializeInstallments({
      scheduleId: 'job-1',
      planId: 'plan-1',
      clientId: 'client-1',
      companyId: 'co-1',
      existing: [],
      payments: [],
      template: {
        version: 1,
        type: 'deposit_remainder',
        deposit: { mode: 'percent', percent: 30 },
      },
      totalCharged: 1000,
      visitStart: new Date('2026-07-15T15:00:00.000Z'),
      newId: () => `new-${++n}`,
    })
    const dep = result.installments.find((i) => i.key === 'deposit')!
    const rem = result.installments.find((i) => i.key === 'remainder')!
    assert.equal(dep.amount_due, 300)
    assert.equal(rem.amount_due, 700)
    assert.equal(rem.status, 'pending')
  })

  it('rematerialize custom percent intervals match expand preview', () => {
    let n = 0
    const result = rematerializeInstallments({
      scheduleId: 'job-1',
      planId: 'plan-1',
      clientId: 'client-1',
      companyId: 'co-1',
      existing: [],
      payments: [],
      template: {
        version: 1,
        type: 'custom_installments',
        installments: [
          {
            key: 'a',
            label: 'A',
            share: { mode: 'percent', percent: 33 },
            collectible: { when: 'anytime' },
          },
          {
            key: 'b',
            label: 'B',
            share: { mode: 'remainder' },
            collectible: { when: 'on_or_after_visit_start' },
          },
        ],
      },
      totalCharged: 100,
      visitStart: new Date('2026-07-15T15:00:00.000Z'),
      newId: () => `new-${++n}`,
    })
    assert.equal(result.installments.find((i) => i.key === 'a')!.amount_due, 33)
    assert.equal(result.installments.find((i) => i.key === 'b')!.amount_due, 67)
  })

  it('deposit $300 paid, job $1000→$800: deposit stays $300, remainder $500', () => {
    const installments = [
      inst({ id: 'i1', key: 'deposit', sequence: 1, amount_due: 300 }),
      inst({ id: 'i2', key: 'remainder', sequence: 2, amount_due: 700 }),
    ]
    const payments = [pay({ id: 'p1', amount: 300, installment_id: 'i1' })]
    const shares = new Map<string, InstallmentShare>([
      ['deposit', { mode: 'percent', percent: 30 }],
      ['remainder', { mode: 'remainder' }],
    ])
    const result = rebalanceInstallments({
      installments,
      payments,
      totalCharged: 800,
      sharesByKey: shares,
    })
    const dep = result.installments.find((i) => i.id === 'i1')!
    const rem = result.installments.find((i) => i.id === 'i2')!
    assert.equal(dep.amount_due, 300)
    assert.equal(rem.amount_due, 500)
    assert.equal(result.needsAttention, false)
  })

  it('deposit $300 paid, job $1000→$250: needs_attention', () => {
    const installments = [
      inst({ id: 'i1', key: 'deposit', sequence: 1, amount_due: 300 }),
      inst({ id: 'i2', key: 'remainder', sequence: 2, amount_due: 700 }),
    ]
    const payments = [pay({ id: 'p1', amount: 300, installment_id: 'i1' })]
    const shares = new Map<string, InstallmentShare>([
      ['deposit', { mode: 'fixed', amount: 300 }],
      ['remainder', { mode: 'remainder' }],
    ])
    const result = rebalanceInstallments({
      installments,
      payments,
      totalCharged: 250,
      sharesByKey: shares,
    })
    assert.equal(result.installments.find((i) => i.id === 'i1')!.amount_due, 300)
    assert.equal(result.installments.find((i) => i.id === 'i2')!.amount_due, 0)
    assert.equal(result.needsAttention, true)
  })

  it('half-paid deposit freezes floor at allocatedPaid', () => {
    const installments = [
      inst({ id: 'i1', key: 'deposit', sequence: 1, amount_due: 300 }),
      inst({ id: 'i2', key: 'remainder', sequence: 2, amount_due: 700 }),
    ]
    const payments = [pay({ id: 'p1', amount: 150, installment_id: 'i1' })]
    const shares = new Map<string, InstallmentShare>([
      ['deposit', { mode: 'percent', percent: 30 }],
      ['remainder', { mode: 'remainder' }],
    ])
    const result = rebalanceInstallments({
      installments,
      payments,
      totalCharged: 500,
      sharesByKey: shares,
    })
    const dep = result.installments.find((i) => i.id === 'i1')!
    assert.ok(dep.amount_due >= 150 - 0.01)
  })

  it('fixed shares shrink: first fixed then remainder', () => {
    const installments = [
      inst({ id: 'i1', key: 'a', sequence: 1, amount_due: 400 }),
      inst({ id: 'i2', key: 'b', sequence: 2, amount_due: 400 }),
      inst({ id: 'i3', key: 'c', sequence: 3, amount_due: 200 }),
    ]
    const shares = new Map<string, InstallmentShare>([
      ['a', { mode: 'fixed', amount: 400 }],
      ['b', { mode: 'fixed', amount: 400 }],
      ['c', { mode: 'remainder' }],
    ])
    const result = rebalanceInstallments({
      installments,
      payments: [],
      totalCharged: 500,
      sharesByKey: shares,
    })
    assert.equal(result.installments.find((i) => i.id === 'i1')!.amount_due, 400)
    assert.equal(result.installments.find((i) => i.id === 'i2')!.amount_due, 100)
    assert.equal(result.installments.find((i) => i.id === 'i3')!.amount_due, 0)
  })

  it('superseded deposit $300 paid: new opens sum to $700 with absolute percent', () => {
    const installments = [
      inst({
        id: 'i-old',
        key: 'deposit',
        sequence: 1,
        amount_due: 300,
        status: 'superseded',
      }),
      inst({ id: 'i-new1', key: 'phase1', sequence: 1, amount_due: 500 }),
      inst({ id: 'i-new2', key: 'phase2', sequence: 2, amount_due: 500 }),
    ]
    const payments = [pay({ id: 'p1', amount: 300, installment_id: 'i-old' })]
    const shares = new Map<string, InstallmentShare>([
      ['phase1', { mode: 'percent', percent: 50 }],
      ['phase2', { mode: 'remainder' }],
    ])
    const result = rebalanceInstallments({
      installments,
      payments,
      totalCharged: 1000,
      sharesByKey: shares,
    })
    // 50% of job total ($500), not 50% renormalized across open pool only
    assert.equal(result.installments.find((i) => i.id === 'i-new1')!.amount_due, 500)
    assert.equal(result.installments.find((i) => i.id === 'i-new2')!.amount_due, 200)
    const openSum = result.installments
      .filter((i) => i.status !== 'superseded')
      .reduce((s, i) => s + i.amount_due, 0)
    assert.equal(roundMoney(openSum), 700)
    const allSum = result.installments.reduce((s, i) => s + i.amount_due, 0)
    assert.equal(roundMoney(allSum), 1000)
  })
})

describe('payment-plans / rematerialize', () => {
  it('payment linked to deposit survives plan label rebalance', () => {
    let n = 0
    const existing = [
      inst({ id: 'dep-id', key: 'deposit', sequence: 1, amount_due: 300 }),
      inst({ id: 'rem-id', key: 'remainder', sequence: 2, amount_due: 700 }),
    ]
    const payments = [pay({ id: 'p1', amount: 300, installment_id: 'dep-id' })]
    const result = rematerializeInstallments({
      scheduleId: 'job-1',
      planId: 'plan-1',
      clientId: 'client-1',
      companyId: 'co-1',
      existing,
      payments,
      template: {
        version: 1,
        type: 'deposit_remainder',
        deposit: { mode: 'percent', percent: 30 },
      },
      totalCharged: 1000,
      visitStart: new Date('2026-07-15T15:00:00.000Z'),
      newId: () => `new-${++n}`,
    })
    const dep = result.installments.find((i) => i.key === 'deposit')!
    assert.equal(dep.id, 'dep-id')
    assert.equal(payments[0].installment_id, 'dep-id')
    assert.ok(dep.amount_due >= 300 - 0.01)
  })

  it('plan type change supersedes deposit without deleting linked id', () => {
    let n = 0
    const existing = [
      inst({ id: 'dep-id', key: 'deposit', sequence: 1, amount_due: 300 }),
      inst({ id: 'rem-id', key: 'remainder', sequence: 2, amount_due: 700 }),
    ]
    const payments = [pay({ id: 'p1', amount: 300, installment_id: 'dep-id' })]
    const result = rematerializeInstallments({
      scheduleId: 'job-1',
      planId: 'plan-1',
      clientId: 'client-1',
      companyId: 'co-1',
      existing,
      payments,
      template: {
        version: 1,
        type: 'custom_installments',
        installments: [
          {
            key: 'phase1',
            label: 'Phase 1',
            share: { mode: 'percent', percent: 50 },
            collectible: { when: 'anytime' },
          },
          {
            key: 'phase2',
            label: 'Phase 2',
            share: { mode: 'remainder' },
            collectible: { when: 'on_or_after_visit_start' },
          },
        ],
      },
      totalCharged: 1000,
      visitStart: new Date('2026-07-15T15:00:00.000Z'),
      newId: () => `new-${++n}`,
    })
    const oldDep = result.installments.find((i) => i.id === 'dep-id')!
    assert.equal(oldDep.status, 'superseded')
    assert.equal(result.deletedIds.includes('dep-id'), false)
    const openSum = result.installments
      .filter((i) => i.status !== 'superseded')
      .reduce((s, i) => s + i.amount_due, 0)
    assert.equal(roundMoney(openSum), 700)
  })

  it('re-introducing deposit key un-supersedes same row id', () => {
    let n = 0
    const existing = [
      inst({
        id: 'dep-id',
        key: 'deposit',
        sequence: 1,
        amount_due: 300,
        status: 'superseded',
      }),
      inst({ id: 'p1-id', key: 'phase1', sequence: 1, amount_due: 700 }),
    ]
    const payments = [pay({ id: 'p1', amount: 300, installment_id: 'dep-id' })]
    const result = rematerializeInstallments({
      scheduleId: 'job-1',
      planId: 'plan-1',
      clientId: 'client-1',
      companyId: 'co-1',
      existing,
      payments,
      template: {
        version: 1,
        type: 'deposit_remainder',
        deposit: { mode: 'fixed', amount: 300 },
      },
      totalCharged: 1000,
      visitStart: new Date('2026-07-15T15:00:00.000Z'),
      newId: () => `new-${++n}`,
    })
    const dep = result.installments.find((i) => i.key === 'deposit')!
    assert.equal(dep.id, 'dep-id')
    assert.notEqual(dep.status, 'superseded')
    assert.equal(result.installments.filter((i) => i.key === 'deposit').length, 1)
  })
})

describe('payment-plans / collectibility and canPay', () => {
  it('anytime deposit is collectible before visit start', () => {
    assert.equal(
      isInstallmentCollectible(
        { when: 'anytime' },
        { status: 'scheduled', startTime: '2099-01-01T00:00:00.000Z' }
      ),
      true
    )
    assert.equal(
      isInstallmentCollectible(
        { when: 'on_or_after_visit_start' },
        { status: 'scheduled', startTime: '2099-01-01T00:00:00.000Z' }
      ),
      false
    )
  })

  it('implicit full_balance zeros amountDueNow when not billable', () => {
    const p = computeImplicitFullBalancePayable({
      totalCharged: 100,
      totalPaid: 0,
      billable: false,
    })
    assert.equal(p.balanceDue, 100)
    assert.equal(p.amountDueNow, 0)
    assert.equal(
      computeCanPay({
        balanceDue: 100,
        lineItemCount: 1,
        billable: false,
        plan: null,
      }),
      false
    )
  })

  it('deposit plan can pay before visit when deposit remaining', () => {
    const installments = [
      inst({
        id: 'i1',
        key: 'deposit',
        sequence: 1,
        amount_due: 300,
        collectible_policy: { when: 'anytime' },
      }),
      inst({
        id: 'i2',
        key: 'remainder',
        sequence: 2,
        amount_due: 700,
        collectible_policy: { when: 'on_or_after_visit_start' },
      }),
    ]
    const payable = computePlanPayable({
      installments,
      payments: [],
      totalCharged: 1000,
      totalPaid: 0,
      allowPayAhead: false,
      schedule: { status: 'scheduled', startTime: '2099-01-01T00:00:00.000Z' },
    })
    assert.equal(payable.balanceDue, 1000)
    assert.equal(payable.amountDueNow, 300)
    assert.equal(payable.maxPayableNow, 300)
    assert.equal(
      computeCanPay({
        balanceDue: 1000,
        lineItemCount: 1,
        billable: false,
        plan: {
          allowPayAhead: false,
          amountDueNow: 300,
          hasCollectibleNow: true,
        },
      }),
      true
    )
  })

  it('buildPlanProgressSummary surfaces next collectible', () => {
    const summary = buildPlanProgressSummary({
      planType: 'deposit_remainder',
      allowPayAhead: true,
      lockPortalToDueNow: false,
      needsAttention: false,
      needsAttentionReason: null,
      installments: [
        inst({
          id: 'i1',
          key: 'deposit',
          sequence: 1,
          amount_due: 300,
          collectible_policy: { when: 'anytime' },
        }),
        inst({
          id: 'i2',
          key: 'remainder',
          sequence: 2,
          amount_due: 700,
          collectible_policy: { when: 'on_or_after_visit_start' },
        }),
      ],
      payments: [],
      totalCharged: 1000,
      totalPaid: 0,
      schedule: { status: 'scheduled', startTime: '2099-01-01T00:00:00.000Z' },
    })
    assert.equal(summary.nextInstallment?.id, 'i1')
    assert.equal(summary.amountDueNow, 300)
    assert.equal(summary.maxPayableNow, 1000)
  })
})

describe('payment-plans / validatePaymentAmount', () => {
  it('enforces stripe minimum without last-pennies exception', () => {
    const r = validatePaymentAmount({
      amount: 0.4,
      balanceDue: 0.4,
      maxPayableNow: 0.4,
      allowPayAhead: true,
      minCardAmount: STRIPE_MIN_USD,
    })
    assert.equal(r.ok, false)
  })

  it('rejects amount over balanceDue', () => {
    const r = validatePaymentAmount({
      amount: 50,
      balanceDue: 40,
      maxPayableNow: 40,
      allowPayAhead: true,
    })
    assert.equal(r.ok, false)
  })

  it('rejects targeted over-remaining when !allowPayAhead', () => {
    const r = validatePaymentAmount({
      amount: 200,
      balanceDue: 500,
      maxPayableNow: 100,
      targetRemaining: 100,
      allowPayAhead: false,
    })
    assert.equal(r.ok, false)
  })
})

describe('payment-plans / all_future matrix (K8)', () => {
  const nowMs = Date.parse('2026-07-15T12:00:00.000Z')
  const futureMs = Date.parse('2026-08-01T12:00:00.000Z')
  const pastMs = Date.parse('2026-07-01T12:00:00.000Z')

  it('skips primary without tallying', () => {
    const d = classifyAllFutureInstance({
      isPrimary: true,
      status: 'scheduled',
      startTimeMs: futureMs,
      nowMs,
      hasPayments: false,
      planSource: null,
      includeCustomized: false,
    })
    assert.equal(d, 'skipPrimary')
    assert.deepEqual(
      tallyAllFutureDecision(emptyAllFutureCounts(), d),
      emptyAllFutureCounts()
    )
  })

  it('skips past / archived / cancelled as skippedPast', () => {
    assert.equal(
      classifyAllFutureInstance({
        isPrimary: false,
        status: 'scheduled',
        startTimeMs: pastMs,
        nowMs,
        hasPayments: false,
        planSource: null,
        includeCustomized: false,
      }),
      'skippedPast'
    )
    assert.equal(
      classifyAllFutureInstance({
        isPrimary: false,
        status: 'archived',
        startTimeMs: futureMs,
        nowMs,
        hasPayments: false,
        planSource: null,
        includeCustomized: false,
      }),
      'skippedPast'
    )
    assert.equal(
      classifyAllFutureInstance({
        isPrimary: false,
        status: 'cancelled',
        startTimeMs: futureMs,
        nowMs,
        hasPayments: false,
        planSource: null,
        includeCustomized: false,
      }),
      'skippedPast'
    )
  })

  it('skips visits with payments before override check', () => {
    assert.equal(
      classifyAllFutureInstance({
        isPrimary: false,
        status: 'scheduled',
        startTimeMs: futureMs,
        nowMs,
        hasPayments: true,
        planSource: 'job_override',
        includeCustomized: false,
      }),
      'skippedPaid'
    )
  })

  it('skips job_override unless includeCustomized', () => {
    assert.equal(
      classifyAllFutureInstance({
        isPrimary: false,
        status: 'scheduled',
        startTimeMs: futureMs,
        nowMs,
        hasPayments: false,
        planSource: 'job_override',
        includeCustomized: false,
      }),
      'skippedOverride'
    )
    assert.equal(
      classifyAllFutureInstance({
        isPrimary: false,
        status: 'scheduled',
        startTimeMs: futureMs,
        nowMs,
        hasPayments: false,
        planSource: 'job_override',
        includeCustomized: true,
      }),
      'update'
    )
  })

  it('updates company/series/open visits', () => {
    assert.equal(
      classifyAllFutureInstance({
        isPrimary: false,
        status: 'scheduled',
        startTimeMs: futureMs,
        nowMs,
        hasPayments: false,
        planSource: 'series_default',
        includeCustomized: false,
      }),
      'update'
    )
    assert.equal(
      classifyAllFutureInstance({
        isPrimary: false,
        status: 'in_progress',
        startTimeMs: futureMs,
        nowMs,
        hasPayments: false,
        planSource: 'company_default',
        includeCustomized: false,
      }),
      'update'
    )
    assert.equal(
      classifyAllFutureInstance({
        isPrimary: false,
        status: 'scheduled',
        startTimeMs: futureMs,
        nowMs,
        hasPayments: false,
        planSource: null,
        includeCustomized: false,
      }),
      'update'
    )
  })

  it('tallies matrix counts and formats toast', () => {
    let counts = emptyAllFutureCounts()
    const decisions = [
      'skipPrimary',
      'update',
      'update',
      'skippedPaid',
      'skippedPaid',
      'skippedOverride',
      'skippedPast',
    ] as const
    for (const d of decisions) {
      counts = tallyAllFutureDecision(counts, d)
    }
    assert.deepEqual(counts, {
      updated: 2,
      skippedPast: 1,
      skippedPaid: 2,
      skippedOverride: 1,
    })
    assert.equal(
      formatAllFutureApplyToast(counts),
      'Updated 2 future visits; skipped 2 with payments, 1 customized, 1 past.'
    )
    assert.equal(
      formatAllFutureApplyToast({
        updated: 1,
        skippedPast: 0,
        skippedPaid: 0,
        skippedOverride: 0,
      }),
      'Updated 1 future visit.'
    )
  })
})

describe('invoice installment schedule helpers (PR6)', () => {
  it('hides schedule for null or full_balance plans', () => {
    assert.equal(shouldShowInvoiceInstallmentSchedule(null), false)
    assert.equal(
      shouldShowInvoiceInstallmentSchedule({
        planType: 'full_balance',
        installments: [
          {
            id: '1',
            key: 'full',
            label: 'Balance',
            sequence: 1,
            amountDue: 100,
            amountPaid: 0,
            remaining: 100,
            status: 'pending',
            collectibleNow: true,
            dueDate: null,
          },
        ],
      }),
      false
    )
  })

  it('shows schedule for deposit plans with active rows', () => {
    assert.equal(
      shouldShowInvoiceInstallmentSchedule({
        planType: 'deposit_remainder',
        installments: [
          {
            id: '1',
            key: 'deposit',
            label: 'Deposit',
            sequence: 1,
            amountDue: 50,
            amountPaid: 50,
            remaining: 0,
            status: 'paid',
            collectibleNow: false,
            dueDate: '2026-07-01',
          },
          {
            id: '2',
            key: 'remainder',
            label: 'Remainder',
            sequence: 2,
            amountDue: 50,
            amountPaid: 10,
            remaining: 40,
            status: 'partial',
            collectibleNow: true,
            dueDate: null,
          },
          {
            id: '3',
            key: 'old',
            label: 'Old',
            sequence: 3,
            amountDue: 0,
            amountPaid: 0,
            remaining: 0,
            status: 'superseded',
            collectibleNow: false,
            dueDate: null,
          },
        ],
      }),
      true
    )
  })

  it('maps active rows with status labels and drops superseded', () => {
    const rows = toInvoiceInstallmentRows({
      installments: [
        {
          id: '2',
          key: 'remainder',
          label: 'Remainder',
          sequence: 2,
          amountDue: 50,
          amountPaid: 10,
          remaining: 40,
          status: 'partial',
          collectibleNow: true,
          dueDate: null,
        },
        {
          id: '1',
          key: 'deposit',
          label: 'Deposit',
          sequence: 1,
          amountDue: 50,
          amountPaid: 50,
          remaining: 0,
          status: 'paid',
          collectibleNow: false,
          dueDate: '2026-07-01',
        },
        {
          id: '3',
          key: 'old',
          label: 'Old',
          sequence: 3,
          amountDue: 0,
          amountPaid: 0,
          remaining: 0,
          status: 'superseded',
          collectibleNow: false,
          dueDate: null,
        },
      ],
    })
    assert.equal(rows.length, 2)
    assert.equal(rows[0].label, 'Deposit')
    assert.equal(rows[0].statusLabel, 'Paid')
    assert.equal(rows[1].statusLabel, 'Partial')
    assert.equal(formatInstallmentStatusLabel('pending'), 'Due')
  })
})
