import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildInvoiceOverdueReminderCandidates,
  buildVisitReminderCandidates,
  getVisitReminderDayOffset,
  shouldSendInvoiceOverdueReminder,
} from '@/lib/notification-reminders'

describe('notification reminders', () => {
  it('maps visit reminder hours to whole-day offsets', () => {
    assert.equal(getVisitReminderDayOffset(24), 1)
    assert.equal(getVisitReminderDayOffset(36), 2)
    assert.equal(getVisitReminderDayOffset(6), 1)
  })

  it('finds visits on the reminder target day', () => {
    const now = new Date('2026-07-08T14:00:00.000Z')
    const candidates = buildVisitReminderCandidates({
      timezone: 'America/Chicago',
      now,
      hoursBefore: 24,
      schedules: [
        {
          id: 'tomorrow',
          client_id: 'client-1',
          title: 'Lawn service',
          start_time: '2026-07-09T14:00:00.000Z',
          end_time: '2026-07-09T15:00:00.000Z',
          status: 'scheduled',
          client: { company_id: 'company-1' },
        },
        {
          id: 'next-week',
          client_id: 'client-1',
          title: 'Later visit',
          start_time: '2026-07-16T14:00:00.000Z',
          end_time: '2026-07-16T15:00:00.000Z',
          status: 'scheduled',
          client: { company_id: 'company-1' },
        },
      ],
    })

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0]?.scheduleId, 'tomorrow')
    assert.equal(candidates[0]?.visitDay, '2026-07-09')
  })

  it('matches configured invoice overdue offsets exactly', () => {
    assert.equal(shouldSendInvoiceOverdueReminder(7, [7, 14, 30]), 7)
    assert.equal(shouldSendInvoiceOverdueReminder(8, [7, 14, 30]), null)
  })

  it('builds invoice overdue candidates only for sent invoices at offsets', () => {
    const candidates = buildInvoiceOverdueReminderCandidates({
      companyId: 'company-1',
      overdueOffsets: [7, 14],
      now: new Date('2026-07-15T12:00:00.000Z'),
      clients: [{ id: 'client-1', name: 'Client' }],
      schedules: [
        {
          id: 'job-1',
          client_id: 'client-1',
          title: 'Deep clean',
          status: 'archived',
          start_time: '2026-06-01T14:00:00.000Z',
          end_time: '2026-06-01T16:00:00.000Z',
        },
      ],
      lineItems: [
        {
          schedule_id: 'job-1',
          amount: 200,
          created_at: '2026-06-01T16:30:00.000Z',
        },
      ],
      payments: [],
      invoiceDocuments: [
        {
          schedule_id: 'job-1',
          id: 'doc-1',
          created_at: '2026-07-08T12:00:00.000Z',
        },
      ],
    })

    assert.equal(candidates.length, 1)
    assert.equal(candidates[0]?.overdueOffset, 7)
    assert.equal(candidates[0]?.balanceDue, 200)
  })
})