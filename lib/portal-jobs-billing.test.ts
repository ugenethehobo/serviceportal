import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
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
        nextInstallment: { id: 'd', label: 'Deposit', remaining: 300 },
        installments: [
          {
            id: 'd',
            key: 'deposit',
            label: 'Deposit',
            sequence: 1,
            amountDue: 300,
            amountPaid: 0,
            remaining: 300,
            status: 'pending',
            collectibleNow: true,
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
})
