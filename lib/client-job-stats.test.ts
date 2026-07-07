import assert from 'node:assert/strict'
import test from 'node:test'
import { countActiveClientJobs } from './client-job-stats.ts'

test('countActiveClientJobs counts scheduled and in_progress jobs that have not ended', () => {
  const now = new Date('2026-07-06T15:00:00.000Z')
  const count = countActiveClientJobs(
    [
      { status: 'scheduled', end_time: '2026-07-07T12:00:00.000Z' },
      { status: 'in_progress', end_time: '2026-07-06T18:00:00.000Z' },
      { status: 'scheduled', end_time: '2026-07-05T12:00:00.000Z' },
      { status: 'archived', end_time: '2026-07-08T12:00:00.000Z' },
    ],
    now
  )
  assert.equal(count, 2)
})