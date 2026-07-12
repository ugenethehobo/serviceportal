import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  countMtdJobOccurrences,
  sumRecordedStripePaymentsInPeriod,
} from '@/lib/dashboard-month-kpis'

describe('dashboard month KPIs', () => {
  const timezone = 'America/Chicago'
  const now = new Date('2026-07-11T18:00:00.000Z')

  it('counts one-off completed and open jobs in the month', () => {
    const counts = countMtdJobOccurrences({
      timezone,
      now,
      schedules: [
        {
          id: 'done',
          status: 'archived',
          start_time: '2026-07-03T14:00:00.000Z',
          end_time: '2026-07-03T15:00:00.000Z',
        },
        {
          id: 'open',
          status: 'scheduled',
          start_time: '2026-07-20T14:00:00.000Z',
          end_time: '2026-07-20T15:00:00.000Z',
        },
        {
          id: 'outside',
          status: 'scheduled',
          start_time: '2026-08-03T14:00:00.000Z',
          end_time: '2026-08-03T15:00:00.000Z',
        },
      ],
      recurringSeries: [],
    })

    assert.equal(counts.completed, 1)
    assert.equal(counts.open, 1)
  })

  it('includes projected recurring visits for the month', () => {
    const counts = countMtdJobOccurrences({
      timezone,
      now: new Date('2026-07-13T18:00:00.000Z'),
      schedules: [
        {
          id: 'anchor',
          status: 'scheduled',
          start_time: '2026-07-07T14:00:00.000Z',
          end_time: '2026-07-07T15:00:00.000Z',
          recurring_rule_id: 'rule-1',
        },
      ],
      recurringSeries: [
        {
          schedule: {
            id: 'anchor',
            title: 'Weekly clean',
            start_time: '2026-07-07T14:00:00.000Z',
            end_time: '2026-07-07T15:00:00.000Z',
            status: 'scheduled',
            client_id: 'client-1',
            crew_id: null,
            recurring_rule_id: 'rule-1',
            client: { name: 'Client' },
            crew: null,
          },
          rule: { id: 'rule-1', frequency: 'weekly', interval: 1 },
        },
      ],
    })

    assert.equal(counts.completed, 1)
    assert.equal(counts.open, 3)
  })

  it('dedupes materialized recurring visits against projections', () => {
    const counts = countMtdJobOccurrences({
      timezone,
      now: new Date('2026-07-20T18:00:00.000Z'),
      schedules: [
        {
          id: 'archived-visit',
          status: 'archived',
          start_time: '2026-07-07T14:00:00.000Z',
          end_time: '2026-07-07T15:00:00.000Z',
          recurring_rule_id: 'rule-1',
        },
        {
          id: 'next-visit',
          status: 'scheduled',
          start_time: '2026-07-14T14:00:00.000Z',
          end_time: '2026-07-14T15:00:00.000Z',
          recurring_rule_id: 'rule-1',
        },
      ],
      recurringSeries: [
        {
          schedule: {
            id: 'next-visit',
            title: 'Weekly clean',
            start_time: '2026-07-14T14:00:00.000Z',
            end_time: '2026-07-14T15:00:00.000Z',
            status: 'scheduled',
            client_id: 'client-1',
            crew_id: null,
            recurring_rule_id: 'rule-1',
            client: { name: 'Client' },
            crew: null,
          },
          rule: { id: 'rule-1', frequency: 'weekly', interval: 1 },
        },
      ],
    })

    assert.equal(counts.completed, 2)
    assert.equal(counts.open, 2)
  })

  it('sums stripe payments in the month', () => {
    const total = sumRecordedStripePaymentsInPeriod(
      [
        { amount: 100, payment_date: '2026-07-02', source: 'stripe' },
        { amount: 50, payment_date: '2026-07-10', source: 'manual' },
        { amount: 25, payment_date: '2026-06-30', source: 'stripe' },
      ],
      timezone,
      now
    )

    assert.equal(total, 100)
  })
})