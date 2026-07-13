import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCompanyActivity,
  buildClientActivityForStaff,
  mapPortalActivityForStaff,
  staffClientHref,
} from '@/lib/staff-activity'
import { buildPortalActivity } from '@/lib/portal-activity'

describe('staff activity', () => {
  it('maps portal activity links to staff client routes', () => {
    const portalItems = buildPortalActivity({
      timezone: 'America/Chicago',
      estimates: [
        {
          id: 'est-1',
          title: 'Spring cleanup',
          total: 250,
          status: 'sent',
          updated_at: '2026-07-10T12:00:00.000Z',
        },
      ],
      contracts: [],
      jobs: [],
      payments: [],
      lineItems: [],
      schedulesById: new Map(),
    })

    const mapped = mapPortalActivityForStaff(portalItems, 'client-1')
    assert.equal(mapped[0]?.title, 'Estimate awaiting client review')
    assert.equal(mapped[0]?.href, staffClientHref('client-1', 'estimates'))
    assert.equal(mapped[0]?.urgent, true)
  })

  it('builds company-wide activity with client names and staff links', () => {
    const items = buildCompanyActivity({
      payments: [
        {
          id: 'pay-1',
          client_id: 'client-1',
          schedule_id: 'job-1',
          amount: 120,
          source: 'stripe',
          created_at: '2026-07-11T15:00:00.000Z',
          client: { id: 'client-1', name: 'Acme Lawn' },
        },
      ],
      contracts: [
        {
          id: 'contract-1',
          client_id: 'client-1',
          schedule_id: 'job-2',
          title: 'Service Agreement',
          status: 'ready_for_signing',
          sent_at: '2026-07-11T12:00:00.000Z',
          updated_at: '2026-07-11T12:00:00.000Z',
          client_signed_at: null,
          client: { id: 'client-1', name: 'Acme Lawn' },
        },
      ],
      estimates: [],
      leads: [
        {
          id: 'lead-1',
          name: 'Jordan Prospect',
          follow_up_at: '2026-07-11T10:00:00.000Z',
          status: 'contacted',
        },
      ],
      messages: [],
      now: new Date('2026-07-11T18:00:00.000Z'),
    })

    assert.ok(items.some((item) => item.type === 'payment_received'))
    assert.ok(items.some((item) => item.type === 'contract_awaiting_signature' && item.urgent))
    assert.ok(items.some((item) => item.type === 'lead_follow_up_due' && item.href.includes('lead-1')))
  })

  it('includes accepted estimates in client staff activity', () => {
    const items = buildClientActivityForStaff({
      timezone: 'America/Chicago',
      clientId: 'client-9',
      estimates: [],
      contracts: [],
      jobs: [],
      payments: [],
      lineItems: [],
      schedulesById: new Map(),
      staffEstimates: [
        {
          id: 'est-9',
          client_id: 'client-9',
          title: 'Fall cleanup',
          total: 400,
          status: 'accepted',
          updated_at: '2026-07-09T12:00:00.000Z',
        },
      ],
    })

    assert.ok(items.some((item) => item.type === 'estimate_accepted'))
  })
})