import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildIsoFromDayAndMinutes,
  buildScheduleCalendarJobs,
  clampCalendarStartMinutes,
  getCompanyWeekDayBounds,
  isScheduleJobDraggable,
  mergeProjectedRecurringJobs,
  snapCalendarMinutes,
  type ScheduleCalendarDay,
} from '@/lib/schedule-calendar'

describe('schedule calendar helpers', () => {
  it('returns seven days for a company week', () => {
    const week = getCompanyWeekDayBounds('America/Chicago', new Date('2026-07-08T18:00:00.000Z'), 0)
    assert.equal(week.days.length, 7)
    assert.ok(week.weekStartIso < week.weekEndIso)
  })

  it('snaps minutes to 15-minute increments', () => {
    assert.equal(snapCalendarMinutes(10), 15)
    assert.equal(snapCalendarMinutes(22), 15)
    assert.equal(snapCalendarMinutes(23), 30)
  })

  it('clamps start minutes inside business hours', () => {
    const clamped = clampCalendarStartMinutes(7 * 60, 60, { start: '08:00', end: '17:00' })
    assert.equal(clamped, 8 * 60)

    const late = clampCalendarStartMinutes(16 * 60 + 30, 60, { start: '08:00', end: '17:00' })
    assert.equal(late, 16 * 60)
  })

  it('builds ISO timestamps from day and minutes', () => {
    const iso = buildIsoFromDayAndMinutes('2026-07-08', 9 * 60 + 30, 'America/Chicago')
    assert.ok(iso.includes('T'))
    assert.ok(!Number.isNaN(new Date(iso).getTime()))
  })

  it('allows drag only for scheduled and in-progress jobs', () => {
    assert.equal(isScheduleJobDraggable('scheduled'), true)
    assert.equal(isScheduleJobDraggable('in_progress'), true)
    assert.equal(isScheduleJobDraggable('archived'), false)
    assert.equal(isScheduleJobDraggable('cancelled'), false)
  })

  it('omits archived recurring visits from the calendar', () => {
    const week = getCompanyWeekDayBounds('America/Chicago', new Date('2026-07-08T18:00:00.000Z'), 0)
    const days: ScheduleCalendarDay[] = week.days.map((day, dayIndex) => ({
      ...day,
      dayIndex,
    }))
    const businessHours = { start: '08:00', end: '17:00' }

    const jobs = buildScheduleCalendarJobs(
      [
        {
          id: 'archived-recurring',
          title: 'Past visit',
          start_time: '2026-07-07T13:00:00.000Z',
          end_time: '2026-07-07T14:00:00.000Z',
          status: 'archived',
          client_id: 'client-1',
          crew_id: null,
          recurring_rule_id: 'rule-1',
          client: { name: 'Client' },
          crew: null,
        },
        {
          id: 'scheduled-recurring',
          title: 'Next visit',
          start_time: '2026-07-08T13:00:00.000Z',
          end_time: '2026-07-08T14:00:00.000Z',
          status: 'scheduled',
          client_id: 'client-1',
          crew_id: null,
          recurring_rule_id: 'rule-1',
          client: { name: 'Client' },
          crew: null,
        },
      ],
      days,
      new Map(),
      'America/Chicago',
      businessHours,
      new Date('2026-07-08T18:00:00.000Z')
    )

    assert.equal(jobs.length, 1)
    assert.equal(jobs[0]?.id, 'scheduled-recurring')
    assert.equal(jobs[0]?.isDraggable, true)
    assert.equal(jobs[0]?.isProjected, false)
  })

  it('adds projected recurring visits for the visible week', () => {
    const week = getCompanyWeekDayBounds('America/Chicago', new Date('2026-07-08T18:00:00.000Z'), 0)
    const days: ScheduleCalendarDay[] = week.days.map((day, dayIndex) => ({
      ...day,
      dayIndex,
    }))
    const businessHours = { start: '08:00', end: '17:00' }
    const schedules = [
      {
        id: 'anchor',
        title: 'Weekly clean',
        start_time: '2026-07-07T13:00:00.000Z',
        end_time: '2026-07-07T14:00:00.000Z',
        status: 'scheduled',
        client_id: 'client-1',
        crew_id: null,
        recurring_rule_id: 'rule-1',
        client: { name: 'Client' },
        crew: null,
      },
    ]

    const jobs = mergeProjectedRecurringJobs(
      buildScheduleCalendarJobs(schedules, days, new Map(), 'America/Chicago', businessHours),
      schedules,
      [
        {
          schedule: schedules[0],
          rule: { id: 'rule-1', frequency: 'daily', interval: 1 },
        },
      ],
      days,
      new Map(),
      'America/Chicago',
      businessHours,
      new Date('2026-07-08T18:00:00.000Z')
    )

    assert.ok(jobs.length >= 2)
    assert.equal(jobs.some((job) => job.id === 'anchor' && !job.isProjected), true)
    assert.equal(jobs.some((job) => job.isProjected), true)
  })

  it('does not render out-of-week anchors on the first day column', () => {
    const week = getCompanyWeekDayBounds('America/Chicago', new Date('2026-07-08T18:00:00.000Z'), 0)
    const days: ScheduleCalendarDay[] = week.days.map((day, dayIndex) => ({
      ...day,
      dayIndex,
    }))
    const businessHours = { start: '08:00', end: '17:00' }

    const jobs = buildScheduleCalendarJobs(
      [
        {
          id: 'future-anchor',
          title: 'Future recurring anchor',
          start_time: '2026-07-21T13:00:00.000Z',
          end_time: '2026-07-21T14:00:00.000Z',
          status: 'scheduled',
          client_id: 'client-1',
          crew_id: null,
          recurring_rule_id: 'rule-1',
          client: { name: 'Client' },
          crew: null,
        },
      ],
      days,
      new Map(),
      'America/Chicago',
      businessHours,
      new Date('2026-07-08T18:00:00.000Z')
    )

    assert.equal(jobs.length, 0)
  })

  it('does not duplicate projected visits already rendered from the database', () => {
    const week = getCompanyWeekDayBounds('America/Chicago', new Date('2026-07-08T18:00:00.000Z'), 0)
    const days: ScheduleCalendarDay[] = week.days.map((day, dayIndex) => ({
      ...day,
      dayIndex,
    }))
    const businessHours = { start: '08:00', end: '17:00' }
    const schedules = [
      {
        id: 'anchor',
        title: 'Weekly clean',
        start_time: '2026-07-07T13:00:00.000Z',
        end_time: '2026-07-07T14:00:00.000Z',
        status: 'scheduled',
        client_id: 'client-1',
        crew_id: null,
        recurring_rule_id: 'rule-1',
        client: { name: 'Client' },
        crew: null,
      },
    ]

    const rendered = buildScheduleCalendarJobs(
      schedules,
      days,
      new Map(),
      'America/Chicago',
      businessHours
    )
    const merged = mergeProjectedRecurringJobs(
      rendered,
      schedules,
      [
        {
          schedule: schedules[0],
          rule: { id: 'rule-1', frequency: 'weekly', interval: 1 },
        },
      ],
      days,
      new Map(),
      'America/Chicago',
      businessHours,
      new Date('2026-07-08T18:00:00.000Z')
    )

    const anchorMatches = merged.filter(
      (job) => job.recurringRuleId === 'rule-1' && !job.isProjected
    )
    assert.equal(anchorMatches.length, 1)
    assert.equal(
      merged.filter(
        (job) =>
          job.recurringRuleId === 'rule-1' &&
          job.startTime === schedules[0].start_time
      ).length,
      1
    )
  })
})