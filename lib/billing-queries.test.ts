import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mapPaymentRow } from '@/lib/billing-queries'
import { buildReportsData } from '@/lib/reports'

describe('billing queries helpers', () => {
  it('maps payment rows for the payments table', () => {
    const row = mapPaymentRow({
      id: 'pay-1',
      schedule_id: 'job-1',
      client_id: 'client-1',
      company_id: 'company-1',
      amount: 125.5,
      payment_date: '2026-07-01',
      method: 'cash',
      notes: null,
      source: 'stripe',
      stripe_payment_intent_id: 'pi_123',
      created_at: '2026-07-01T12:00:00.000Z',
      schedule: { title: 'Lawn care', status: 'archived' },
      client: { name: 'Acme Co' },
    })

    assert.equal(row.clientName, 'Acme Co')
    assert.equal(row.jobTitle, 'Lawn care')
    assert.equal(row.source, 'stripe')
    assert.equal(row.amount, 125.5)
  })

  it('builds jobsByStatus from schedule status counts', () => {
    const data = buildReportsData({
      period: '30d',
      timezone: 'America/Chicago',
      lineItems: [],
      payments: [],
      schedules: [],
      clients: [{ id: 'client-1', name: 'Acme', status: 'active' }],
      leadsConverted: 0,
      estimatesSent: 0,
      scheduleStatusCounts: [
        { status: 'scheduled', count: 4 },
        { status: 'archived', count: 10 },
      ],
      now: new Date('2026-07-11T18:00:00.000Z'),
    })

    assert.equal(data.summary.jobsScheduled, 4)
    assert.equal(
      data.jobsByStatus.find((entry) => entry.status === 'archived')?.count,
      10
    )
  })
})