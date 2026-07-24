import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPortalBillingOverview,
  buildPortalJobBillingFields,
  getPayableJobs,
  sumBillableBalanceDue,
  type PortalJob,
} from '@/lib/portal-jobs'

function job(partial: Partial<PortalJob> & Pick<PortalJob, 'id' | 'canPay' | 'amountDueNow'>): PortalJob {
  return {
    title: 'Job',
    description: null,
    startTime: '2026-07-01T12:00:00.000Z',
    endTime: '2026-07-01T14:00:00.000Z',
    status: 'scheduled',
    price: 100,
    crew: null,
    serviceAddress: '',
    balanceDue: partial.balanceDue ?? partial.amountDueNow,
    balanceDueFormatted: '$0.00',
    amountDueNowFormatted: '$0.00',
    maxPayableNow: partial.maxPayableNow ?? partial.amountDueNow,
    isPaid: false,
    totalCharged: 100,
    totalPaid: 0,
    isBillable: true,
    ...partial,
  }
}

describe('portal-jobs billing fields', () => {
  it('never zeros ledger balanceDue when not billable', () => {
    const fields = buildPortalJobBillingFields(
      { totalCharged: 200, totalPaid: 50, balanceDue: 150 },
      1,
      false
    )
    assert.equal(fields.balanceDue, 150)
    assert.equal(fields.amountDueNow, 0)
    assert.equal(fields.canPay, false)
  })

  it('allows pay when billable with balance', () => {
    const fields = buildPortalJobBillingFields(
      { totalCharged: 200, totalPaid: 50, balanceDue: 150 },
      1,
      true
    )
    assert.equal(fields.amountDueNow, 150)
    assert.equal(fields.canPay, true)
  })

  it('uses plan amountDueNow for pre-visit deposits', () => {
    const fields = buildPortalJobBillingFields(
      { totalCharged: 1000, totalPaid: 0, balanceDue: 1000 },
      1,
      false,
      {
        planType: 'deposit_remainder',
        allowPayAhead: false,
        lockPortalToDueNow: true,
        needsAttention: false,
        needsAttentionReason: null,
        amountDueNow: 300,
        maxPayableNow: 300,
        amountPaidOnPlan: 0,
        nextInstallment: { id: 'd', label: 'Down payment', remaining: 300 },
        installments: [
          {
            id: 'd',
            key: 'deposit',
            label: 'Down payment',
            sequence: 1,
            amountDue: 300,
            amountPaid: 0,
            remaining: 300,
            status: 'pending',
            collectibleNow: true,
            dueDate: null,
          },
          {
            id: 'r',
            key: 'remainder',
            label: 'Remaining balance',
            sequence: 2,
            amountDue: 700,
            amountPaid: 0,
            remaining: 700,
            status: 'pending',
            collectibleNow: false,
            dueDate: null,
          },
        ],
        hasCollectibleNow: true,
      }
    )
    assert.equal(fields.amountDueNow, 300)
    assert.equal(fields.canPay, true)
    assert.equal(fields.lockPortalToDueNow, true)
    assert.equal(fields.balanceDue, 1000)
    assert.equal(fields.planType, 'deposit_remainder')
    assert.equal(fields.nextInstallmentLabel, 'Down payment')
    assert.equal(fields.installments?.length, 2)
    assert.equal(fields.installments?.[0]?.label, 'Down payment')
  })

  it('sums amountDueNow for payable jobs', () => {
    const jobs = [
      job({ id: 'a', canPay: true, amountDueNow: 100 }),
      job({ id: 'b', canPay: false, amountDueNow: 0, balanceDue: 200 }),
      job({ id: 'c', canPay: true, amountDueNow: 50 }),
    ]
    assert.equal(getPayableJobs(jobs).length, 2)
    assert.equal(sumBillableBalanceDue(jobs), 150)
  })

  it('builds portal billing overview from jobs and payments', () => {
    const jobs = [
      job({
        id: 'a',
        title: 'Lawn',
        canPay: true,
        amountDueNow: 40,
        amountDueNowFormatted: '$40.00',
        totalCharged: 100,
        totalPaid: 60,
        balanceDue: 40,
      }),
      job({
        id: 'b',
        title: 'No charge',
        canPay: false,
        amountDueNow: 0,
        totalCharged: 0,
        totalPaid: 0,
        balanceDue: 0,
      }),
    ]
    const overview = buildPortalBillingOverview(
      jobs,
      [
        {
          id: 'p1',
          schedule_id: 'a',
          amount: 60,
          payment_date: '2026-07-01',
          source: 'card',
        },
      ],
      new Map([['a', { id: 'a', title: 'Lawn' }]])
    )
    assert.equal(overview.jobs.length, 1)
    assert.equal(overview.totalCharged, 100)
    assert.equal(overview.totalPaid, 60)
    assert.equal(overview.balanceDue, 40)
    assert.equal(overview.amountDueNow, 40)
    assert.equal(overview.jobs[0].displayAmountKind, 'due_now')
    assert.equal(overview.recentPayments.length, 1)
    assert.equal(overview.recentPayments[0].jobTitle, 'Lawn')
  })

  it('billing overview prefers due-now amount and plan installment labels', () => {
    const jobs = [
      job({
        id: 'plan-job',
        title: 'Deep clean',
        canPay: true,
        amountDueNow: 300,
        amountDueNowFormatted: '$300.00',
        totalCharged: 1000,
        totalPaid: 0,
        balanceDue: 1000,
        planType: 'deposit_remainder',
        nextInstallmentLabel: 'Down payment',
        installments: [
          {
            id: 'd',
            key: 'deposit',
            label: 'Down payment',
            remaining: 300,
            remainingFormatted: '$300.00',
            amountDue: 300,
            amountDueFormatted: '$300.00',
            amountPaid: 0,
            collectibleNow: true,
            status: 'pending',
          },
          {
            id: 'r',
            key: 'remainder',
            label: 'Remaining balance',
            remaining: 700,
            remainingFormatted: '$700.00',
            amountDue: 700,
            amountDueFormatted: '$700.00',
            amountPaid: 0,
            collectibleNow: false,
            status: 'pending',
          },
        ],
      }),
    ]
    const overview = buildPortalBillingOverview(jobs, [], new Map())
    assert.equal(overview.amountDueNow, 300)
    assert.equal(overview.balanceDue, 1000)
    assert.equal(overview.jobs[0].hasPaymentPlan, true)
    assert.equal(overview.jobs[0].displayAmount, 300)
    assert.equal(overview.jobs[0].displayAmountKind, 'due_now')
    assert.equal(overview.jobs[0].nextInstallmentLabel, 'Down payment')
    assert.equal(overview.jobs[0].installments.length, 2)
  })
})
