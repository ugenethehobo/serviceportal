import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildGoogleCalendarEventPayload,
  shouldExportScheduleToGoogleCalendar,
} from '@/lib/google-calendar-sync'

describe('Google Calendar sync helpers', () => {
  it('exports only scheduled and in-progress jobs', () => {
    assert.equal(shouldExportScheduleToGoogleCalendar('scheduled'), true)
    assert.equal(shouldExportScheduleToGoogleCalendar('in_progress'), true)
    assert.equal(shouldExportScheduleToGoogleCalendar('cancelled'), false)
    assert.equal(shouldExportScheduleToGoogleCalendar('archived'), false)
  })

  it('builds a calendar event payload with local times', () => {
    const payload = buildGoogleCalendarEventPayload({
      id: 'job-1',
      company_id: 'company-1',
      title: 'Lawn mowing',
      description: 'Back gate code 1234',
      start_time: '2026-07-10T14:00:00.000Z',
      end_time: '2026-07-10T15:00:00.000Z',
      status: 'scheduled',
      google_calendar_event_id: null,
      timezone: 'America/Chicago',
      client_name: 'Acme Home',
      client_address: '123 Main St, Springfield, IL',
      crew_name: 'Crew A',
    })

    assert.match(payload.summary, /Lawn mowing/)
    assert.match(payload.summary, /Acme Home/)
    assert.equal(payload.location, '123 Main St, Springfield, IL')
    assert.equal(payload.start.timeZone, 'America/Chicago')
    assert.match(payload.start.dateTime, /2026-07-10T\d{2}:\d{2}/)
    assert.equal(
      payload.extendedProperties.private.service_portal_schedule_id,
      'job-1'
    )
  })
})