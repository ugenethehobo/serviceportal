import assert from 'node:assert/strict'
import { describe, it, mock, afterEach } from 'node:test'
import {
  buildZapierPayload,
  dispatchZapierEvent,
} from '@/lib/integration-events'
import {
  getZapierTestPayload,
  isValidZapierWebhookUrl,
  ZAPIER_EVENT_TYPES,
} from '@/lib/integrations'

describe('Zapier integration', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('validates HTTPS webhook URLs only', () => {
    assert.equal(isValidZapierWebhookUrl('https://hooks.zapier.com/hooks/catch/123/abc'), true)
    assert.equal(isValidZapierWebhookUrl('http://hooks.zapier.com/hooks/catch/123/abc'), false)
    assert.equal(isValidZapierWebhookUrl('not-a-url'), false)
  })

  it('builds a stable payload envelope', () => {
    const payload = buildZapierPayload({
      companyId: 'company-1',
      event: 'lead_created',
      data: { lead_id: 'lead-1', name: 'Acme' },
      occurredAt: '2026-01-01T00:00:00.000Z',
    })

    assert.deepEqual(payload, {
      event: 'lead_created',
      company_id: 'company-1',
      occurred_at: '2026-01-01T00:00:00.000Z',
      data: { lead_id: 'lead-1', name: 'Acme' },
    })
  })

  it('provides sample payloads for every event type', () => {
    for (const event of ZAPIER_EVENT_TYPES) {
      const sample = getZapierTestPayload(event)
      assert.equal(sample.test, true)
      assert.equal(typeof sample, 'object')
    }
  })

  it('POSTs JSON to the webhook URL', async () => {
    const fetchMock = mock.fn(async () => new Response('ok', { status: 200 }))
    mock.method(globalThis, 'fetch', fetchMock)

    const result = await dispatchZapierEvent({
      webhookUrl: 'https://webhook.site/test-endpoint',
      companyId: 'company-1',
      event: 'invoice_sent',
      data: { schedule_id: 'job-1', balance_due: 100 },
    })

    assert.equal(result.delivered, true)
    assert.equal(result.reason, 'ok')
    assert.equal(fetchMock.mock.calls.length, 1)

    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit]
    assert.equal(url, 'https://webhook.site/test-endpoint')
    assert.equal(init.method, 'POST')
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json' })

    const body = JSON.parse(init.body as string)
    assert.equal(body.event, 'invoice_sent')
    assert.equal(body.company_id, 'company-1')
    assert.equal(body.data.schedule_id, 'job-1')
  })

  it('rejects invalid webhook URLs without calling fetch', async () => {
    const fetchMock = mock.fn(async () => new Response('ok', { status: 200 }))
    mock.method(globalThis, 'fetch', fetchMock)

    const result = await dispatchZapierEvent({
      webhookUrl: 'ftp://bad.example/hook',
      companyId: 'company-1',
      event: 'invoice_sent',
      data: {},
    })

    assert.equal(result.delivered, false)
    assert.equal(result.reason, 'invalid_url')
    assert.equal(fetchMock.mock.calls.length, 0)
  })
})