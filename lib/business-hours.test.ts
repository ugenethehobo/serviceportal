import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_OPEN_WEEKDAYS,
  getNextOpenDayDates,
  isClosedDayToday,
  isOpenOnDate,
  normalizeBusinessHours,
  normalizeOpenWeekdays,
  shouldShowTomorrowTimeline,
} from '@/lib/business-hours'

describe('business hours open weekdays', () => {
  it('defaults to Monday through Friday', () => {
    assert.deepEqual(normalizeOpenWeekdays(null), [...DEFAULT_OPEN_WEEKDAYS])
    assert.deepEqual(normalizeOpenWeekdays(undefined), [...DEFAULT_OPEN_WEEKDAYS])
  })

  it('normalizes and sorts weekday arrays', () => {
    assert.deepEqual(normalizeOpenWeekdays([6, 0, 6, 1]), [0, 1, 6])
  })

  it('includes open weekdays on normalized business hours', () => {
    const hours = normalizeBusinessHours('09:00', '18:00', [1, 3, 5])
    assert.equal(hours.start, '09:00')
    assert.equal(hours.end, '18:00')
    assert.deepEqual(hours.openWeekdays, [1, 3, 5])
  })

  it('detects closed days by company timezone date', () => {
    const timezone = 'America/Chicago'
    const weekdays = [1, 2, 3, 4, 5]

    assert.equal(isOpenOnDate('2026-07-06', timezone, weekdays), true)
    assert.equal(isOpenOnDate('2026-07-11', timezone, weekdays), false)
    assert.equal(isOpenOnDate('2026-07-12', timezone, weekdays), false)
  })

  it('detects closed day today without using tomorrow timeline', () => {
    const businessHours = normalizeBusinessHours('08:00', '17:00', [1, 2, 3, 4, 5])
    const saturdayMorning = new Date('2026-07-11T15:00:00.000Z')

    assert.equal(
      isClosedDayToday('America/Chicago', businessHours, saturdayMorning),
      true
    )
    assert.equal(
      shouldShowTomorrowTimeline('America/Chicago', businessHours, saturdayMorning),
      false
    )
  })

  it('shows tomorrow timeline after close on an open weekday', () => {
    const businessHours = normalizeBusinessHours('08:00', '17:00', [1, 2, 3, 4, 5])
    const mondayEvening = new Date('2026-07-06T23:30:00.000Z')

    assert.equal(isClosedDayToday('America/Chicago', businessHours, mondayEvening), false)
    assert.equal(
      shouldShowTomorrowTimeline('America/Chicago', businessHours, mondayEvening),
      true
    )
  })

  it('returns the next five open weekdays after a closed Saturday', () => {
    const businessHours = normalizeBusinessHours('08:00', '17:00', [1, 2, 3, 4, 5])
    const saturday = new Date('2026-07-11T15:00:00.000Z')
    const upcoming = getNextOpenDayDates(
      'America/Chicago',
      businessHours.openWeekdays,
      5,
      saturday
    )

    assert.equal(upcoming.length, 5)
    assert.deepEqual(
      upcoming.map((day) => day.shortLabel),
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    )
  })
})