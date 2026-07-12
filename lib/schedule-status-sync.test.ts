import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  maybeSyncCompanyScheduleStatuses,
  resetScheduleStatusSyncThrottleForTests,
  SCHEDULE_STATUS_SYNC_THROTTLE_MS,
  shouldThrottleScheduleStatusSync,
} from '@/lib/schedule-status-sync'

function createMockAdmin() {
  return {
    from: (table: string) => {
      if (table === 'clients') {
        return {
          select: () => ({
            eq: async () => ({ data: [{ id: 'client-1' }], error: null }),
          }),
        }
      }
      if (table === 'schedules') {
        return {
          update: () => ({
            in: () => ({
              eq: () => ({
                lte: () => ({
                  gt: () => ({
                    select: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
            eq: () => ({
              neq: () => ({
                lt: async () => ({ data: [], error: null }),
              }),
            }),
          }),
          select: () => ({
            in: () => ({
              neq: () => ({
                lt: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
}

describe('schedule status sync throttle', () => {
  it('allows the first sync for a company', () => {
    resetScheduleStatusSyncThrottleForTests()
    assert.equal(shouldThrottleScheduleStatusSync('company-a', 1_000), false)
  })

  it('throttles repeated syncs inside the window', async () => {
    resetScheduleStatusSyncThrottleForTests()
    const companyId = 'company-b'
    const startedAt = Date.now()

    await maybeSyncCompanyScheduleStatuses(createMockAdmin() as never, companyId, {
      force: true,
    })

    assert.equal(shouldThrottleScheduleStatusSync(companyId, startedAt + 1), true)
    assert.equal(
      shouldThrottleScheduleStatusSync(
        companyId,
        startedAt + SCHEDULE_STATUS_SYNC_THROTTLE_MS + 1
      ),
      false
    )
  })
})