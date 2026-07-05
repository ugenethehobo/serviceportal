import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  advanceRecurringDate,
  buildProjectedScheduleId,
  projectRecurringOccurrences,
} from '@/lib/recurring-schedule-projection'

describe('recurring schedule projection', () => {
  it('advances weekly occurrences', () => {
    const start = new Date('2026-07-06T14:00:00.000Z')
    const next = advanceRecurringDate(start, {
      id: 'rule-1',
      frequency: 'weekly',
      interval: 1,
    })

    assert.equal(next.toISOString(), '2026-07-13T14:00:00.000Z')
  })

  it('projects weekly occurrences inside a range', () => {
    const occurrences = projectRecurringOccurrences(
      new Date('2026-07-06T14:00:00.000Z'),
      60 * 60 * 1000,
      { id: 'rule-1', frequency: 'weekly', interval: 1 },
      new Date('2026-07-05T00:00:00.000Z'),
      new Date('2026-07-20T00:00:00.000Z')
    )

    assert.equal(occurrences.length, 2)
    assert.equal(occurrences[0]?.start.toISOString(), '2026-07-06T14:00:00.000Z')
    assert.equal(occurrences[1]?.start.toISOString(), '2026-07-13T14:00:00.000Z')
  })

  it('builds stable projected ids', () => {
    const id = buildProjectedScheduleId('rule-1', '2026-07-13T14:00:00.000Z')
    assert.match(id, /^projected:rule-1:\d+$/)
  })
})