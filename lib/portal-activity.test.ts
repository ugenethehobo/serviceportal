import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPortalActivity } from '@/lib/portal-activity'

describe('portal activity', () => {
  it('includes ready-for-signing contracts as urgent activity', () => {
    const items = buildPortalActivity({
      timezone: 'America/Chicago',
      estimates: [],
      contracts: [
        {
          id: 'contract-1',
          title: 'Service Agreement — Lawn Care',
          status: 'ready_for_signing',
          sent_at: '2026-07-11T12:00:00.000Z',
          updated_at: '2026-07-11T12:00:00.000Z',
          client_signed_at: null,
        },
      ],
      jobs: [],
      payments: [],
      lineItems: [],
      schedulesById: new Map(),
    })

    assert.equal(items.length, 1)
    assert.equal(items[0]?.type, 'contract_signing')
    assert.equal(items[0]?.href, '/portal/contracts/contract-1')
    assert.equal(items[0]?.urgent, true)
  })
})