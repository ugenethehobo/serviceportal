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