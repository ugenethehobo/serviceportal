import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { schedulesOverlapWithBuffer } from '@/lib/schedule-conflicts'

describe('schedule conflict buffers', () => {
  it('detects exact overlap without buffer', () => {
    assert.equal(
      schedulesOverlapWithBuffer(
        '2026-07-10T14:00:00.000Z',
        '2026-07-10T15:00:00.000Z',
        '2026-07-10T14:30:00.000Z',
        '2026-07-10T15:30:00.000Z',
        0
      ),
      true
    )
  })

  it('treats back-to-back jobs as conflicting when buffer is required', () => {
    assert.equal(
      schedulesOverlapWithBuffer(
        '2026-07-10T14:00:00.000Z',
        '2026-07-10T15:00:00.000Z',
        '2026-07-10T15:00:00.000Z',
        '2026-07-10T16:00:00.000Z',
        15
      ),
      true
    )
  })

  it('allows back-to-back jobs when buffer is zero', () => {
    assert.equal(
      schedulesOverlapWithBuffer(
        '2026-07-10T14:00:00.000Z',
        '2026-07-10T15:00:00.000Z',
        '2026-07-10T15:00:00.000Z',
        '2026-07-10T16:00:00.000Z',
        0
      ),
      false
    )
  })

  it('allows enough gap for the configured buffer', () => {
    assert.equal(
      schedulesOverlapWithBuffer(
        '2026-07-10T14:00:00.000Z',
        '2026-07-10T15:00:00.000Z',
        '2026-07-10T15:20:00.000Z',
        '2026-07-10T16:00:00.000Z',
        15
      ),
      false
    )
  })
})