import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildBookingSlotStartMinutes,
  buildBookingSlotsForDay,
  computeAvailableCrewIdsByStartMinutes,
  crewIsAvailableForSlot,
  formatBookingDuration,
  formatBookingPrice,
  isSlotStartAllowed,
  pickAutoAssignedCrewId,
} from '@/lib/booking-slots'

describe('booking slots', () => {
  it('builds slot start minutes within business hours', () => {
    const starts = buildBookingSlotStartMinutes({ start: '08:00', end: '12:00' }, 60, 60)
    assert.deepEqual(starts, [480, 540, 600, 660])
  })

  it('omits starts that do not fit service duration', () => {
    const starts = buildBookingSlotStartMinutes({ start: '08:00', end: '10:30' }, 90, 30)
    assert.deepEqual(starts, [480, 510, 540])
  })

  it('builds labeled slots only when crews are available', () => {
    const available = new Map<number, string[]>([
      [480, ['crew-a']],
      [540, ['crew-b', 'crew-c']],
    ])

    const slots = buildBookingSlotsForDay({
      dateStr: '2026-07-10',
      timezone: 'America/Chicago',
      businessHours: { start: '08:00', end: '12:00' },
      durationMinutes: 60,
      availableCrewIdsByStartMinutes: available,
    })

    assert.equal(slots.length, 2)
    assert.equal(slots[0].startMinutes, 480)
    assert.match(slots[0].label, /\d/)
    assert.equal(slots[1].startMinutes, 540)
  })

  it('picks the first available crew for auto assignment', () => {
    assert.equal(pickAutoAssignedCrewId(['crew-b', 'crew-a']), 'crew-b')
    assert.equal(pickAutoAssignedCrewId([]), null)
  })

  it('formats duration and price labels', () => {
    assert.equal(formatBookingDuration(45), '45 min')
    assert.equal(formatBookingDuration(90), '1h 30m')
    assert.equal(formatBookingDuration(120), '2h')
    assert.equal(formatBookingPrice(125), '$125.00')
    assert.equal(formatBookingPrice(null), null)
  })

  it('respects travel buffer when checking crew availability', () => {
    const conflicts = [
      {
        crew_id: 'crew-a',
        start_time: '2026-07-10T15:00:00.000Z',
        end_time: '2026-07-10T16:00:00.000Z',
      },
    ]

    assert.equal(
      crewIsAvailableForSlot({
        crewId: 'crew-a',
        startIso: '2026-07-10T16:00:00.000Z',
        endIso: '2026-07-10T17:00:00.000Z',
        conflicts,
        bufferMinutes: 15,
      }),
      false
    )

    assert.equal(
      crewIsAvailableForSlot({
        crewId: 'crew-a',
        startIso: '2026-07-10T16:20:00.000Z',
        endIso: '2026-07-10T17:20:00.000Z',
        conflicts,
        bufferMinutes: 15,
      }),
      true
    )
  })

  it('filters slots by minimum notice', () => {
    const now = new Date('2026-07-10T14:00:00.000Z')
    assert.equal(
      isSlotStartAllowed('2026-07-10T15:30:00.000Z', 2, now),
      false
    )
    assert.equal(
      isSlotStartAllowed('2026-07-10T16:30:00.000Z', 2, now),
      true
    )
  })

  it('computes available crews per slot with buffer and notice rules', () => {
    const available = computeAvailableCrewIdsByStartMinutes({
      dateStr: '2026-07-10',
      timezone: 'America/Chicago',
      businessHours: { start: '08:00', end: '12:00' },
      durationMinutes: 60,
      slotSettings: {
        slot_interval_minutes: 60,
        travel_buffer_minutes: 0,
        min_notice_hours: 0,
      },
      crewIds: ['crew-a', 'crew-b'],
      conflicts: [
        {
          crew_id: 'crew-a',
          start_time: '2026-07-10T14:00:00.000Z',
          end_time: '2026-07-10T15:00:00.000Z',
        },
      ],
      now: new Date('2026-07-10T12:00:00.000Z'),
    })

    assert.equal(available.size, 4)
    assert.deepEqual(available.get(480), ['crew-a', 'crew-b'])
    assert.deepEqual(available.get(540), ['crew-b'])
    assert.deepEqual(available.get(600), ['crew-a', 'crew-b'])
  })
})