export type IntegrationProvider = 'quickbooks' | 'google_calendar' | 'zapier'

export type IntegrationStatus = 'disconnected' | 'connected' | 'error'

export type IntegrationRecord = {
  provider: IntegrationProvider
  status: IntegrationStatus
  config: Record<string, unknown>
  connected_at: string | null
}

export const INTEGRATION_PROVIDERS: Record<
  IntegrationProvider,
  { label: string; description: string; connectType: 'oauth' | 'webhook' }
> = {
  quickbooks: {
    label: 'QuickBooks',
    description: 'Sync invoices and payments to QuickBooks Online.',
    connectType: 'oauth',
  },
  google_calendar: {
    label: 'Google Calendar',
    description: 'Two-way sync between jobs and your Google Calendar.',
    connectType: 'oauth',
  },
  zapier: {
    label: 'Zapier',
    description: 'Send webhook events to Zapier for custom automations.',
    connectType: 'webhook',
  },
}

export const ZAPIER_EVENT_TYPES = [
  'invoice_sent',
  'payment_received',
  'job_scheduled',
  'estimate_sent',
  'lead_created',
] as const

export type ZapierEventType = (typeof ZAPIER_EVENT_TYPES)[number]

/** Human-readable labels for Settings UI and docs. */
export const ZAPIER_EVENT_LABELS: Record<ZapierEventType, string> = {
  invoice_sent: 'Invoice sent to client',
  payment_received: 'Payment recorded',
  job_scheduled: 'Job scheduled or rescheduled',
  estimate_sent: 'Estimate sent to client',
  lead_created: 'Lead created',
}

/**
 * Documented `data` fields for each webhook payload.
 * Top-level envelope is always: { event, company_id, occurred_at, data }.
 */
export const ZAPIER_EVENT_PAYLOAD_FIELDS: Record<ZapierEventType, readonly string[]> = {
  invoice_sent: [
    'schedule_id',
    'client_id',
    'job_title',
    'balance_due',
    'client_name',
    'client_email',
  ],
  payment_received: [
    'schedule_id',
    'client_id',
    'job_title',
    'amount',
    'client_name',
    'payment_method',
  ],
  estimate_sent: [
    'estimate_id',
    'client_id',
    'estimate_title',
    'estimate_total',
    'client_name',
    'client_email',
  ],
  job_scheduled: [
    'schedule_id',
    'client_id',
    'job_title',
    'start_time',
    'end_time',
    'crew_id',
    'crew_name',
    'client_name',
    'rescheduled',
  ],
  lead_created: [
    'lead_id',
    'name',
    'contact_name',
    'email',
    'phone',
    'source',
    'status',
    'estimated_value',
  ],
}

export function getZapierTestPayload(event: ZapierEventType): Record<string, unknown> {
  switch (event) {
    case 'invoice_sent':
      return {
        test: true,
        schedule_id: '00000000-0000-0000-0000-000000000001',
        client_id: '00000000-0000-0000-0000-000000000002',
        job_title: 'Sample job — invoice sent',
        balance_due: 249.5,
        client_name: 'Sample Client',
        client_email: 'client@example.com',
      }
    case 'payment_received':
      return {
        test: true,
        schedule_id: '00000000-0000-0000-0000-000000000001',
        client_id: '00000000-0000-0000-0000-000000000002',
        job_title: 'Sample job — payment received',
        amount: 150,
        client_name: 'Sample Client',
        payment_method: 'card',
      }
    case 'estimate_sent':
      return {
        test: true,
        estimate_id: '00000000-0000-0000-0000-000000000003',
        client_id: '00000000-0000-0000-0000-000000000002',
        estimate_title: 'Sample estimate',
        estimate_total: 1200,
        client_name: 'Sample Client',
        client_email: 'client@example.com',
      }
    case 'job_scheduled':
      return {
        test: true,
        schedule_id: '00000000-0000-0000-0000-000000000001',
        client_id: '00000000-0000-0000-0000-000000000002',
        job_title: 'Sample scheduled job',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        crew_id: '00000000-0000-0000-0000-000000000004',
        crew_name: 'Crew A',
        client_name: 'Sample Client',
        rescheduled: false,
      }
    case 'lead_created':
      return {
        test: true,
        lead_id: '00000000-0000-0000-0000-000000000005',
        name: 'Sample Lead',
        contact_name: 'Jamie Chen',
        email: 'lead@example.com',
        phone: '555-0100',
        source: 'website',
        status: 'new',
        estimated_value: 500,
      }
    default:
      return { test: true, message: 'Zapier integration test from Service Portal' }
  }
}

export function normalizeIntegrationRecord(
  row: Partial<IntegrationRecord> | null | undefined,
  provider: IntegrationProvider
): IntegrationRecord {
  return {
    provider,
    status:
      row?.status === 'connected' || row?.status === 'error' ? row.status : 'disconnected',
    config: row?.config && typeof row.config === 'object' ? row.config : {},
    connected_at: row?.connected_at || null,
  }
}

export function getZapierWebhookUrl(config: Record<string, unknown>): string {
  return typeof config.webhook_url === 'string' ? config.webhook_url.trim() : ''
}

export function isValidZapierWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}