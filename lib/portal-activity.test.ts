import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPortalActivity } from '@/lib/portal-activity'
import type { PortalJob } from '@/lib/portal-jobs'

function payableJob(partial: Partial<PortalJob> & Pick<PortalJob, 'id'>): PortalJob {
  return {
    title: 'Deep clean',
    description: null,
    startTime: '2026-07-20T15:00:00.000Z',
    endTime: '2026-07-20T17:00:00.000Z',
    status: 'scheduled',
    price: 1000,
    crew: null,
    serviceAddress: '',
    balanceDue: 1000,
    balanceDueFormatted: '$1,000.00',
    amountDueNow: 300,
    amountDueNowFormatted: '$300.00',
    maxPayableNow: 300,
    canPay: true,
    isPaid: false,
    totalCharged: 1000,
    totalPaid: 0,
    isBillable: false,
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
    ],
    ...partial,
  }
}

describe('portal activity', () => {
  it('includes ready-for-signing contracts as urgent activity', () => {
    const items = buildPortalActivity({
      timezone: 'America/Chicago',
      estimates: [],
      contracts: [
        {
          id: 'contract-1',
          title: 'Service Agreement — Lawn Care',
          status: 'ready_for_signing',
          sent_at: '2026-07-11T12:00:00.000Z',
          updated_at: '2026-07-11T12:00:00.000Z',
          client_signed_at: null,
        },
      ],
      jobs: [],
      payments: [],
      lineItems: [],
      schedulesById: new Map(),
    })

    assert.equal(items.length, 1)
    assert.equal(items[0]?.type, 'contract_signing')
    assert.equal(items[0]?.href, '/portal/contracts/contract-1')
    assert.equal(items[0]?.urgent, true)
  })

  it('names payment-due activity after the plan installment label', () => {
    const items = buildPortalActivity({
      timezone: 'America/Chicago',
      estimates: [],
      jobs: [payableJob({ id: 'job-1' })],
      payments: [],
      lineItems: [],
      schedulesById: new Map(),
    })

    const paymentDue = items.find((item) => item.type === 'payment_due')
    assert.ok(paymentDue)
    assert.equal(paymentDue?.title, 'Down payment due')
    assert.match(paymentDue?.description || '', /\$300/)
  })
})