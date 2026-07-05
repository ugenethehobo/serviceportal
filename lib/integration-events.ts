import {
  getZapierWebhookUrl,
  isValidZapierWebhookUrl,
  type ZapierEventType,
} from '@/lib/integrations'

export type ZapierPayload = {
  event: ZapierEventType
  company_id: string
  occurred_at: string
  data: Record<string, unknown>
}

export function buildZapierPayload(input: {
  companyId: string
  event: ZapierEventType
  data: Record<string, unknown>
  occurredAt?: string
}): ZapierPayload {
  return {
    event: input.event,
    company_id: input.companyId,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    data: input.data,
  }
}

type SupabaseAdminLike = { from: (table: string) => any }

export async function dispatchZapierEvent(input: {
  webhookUrl: string
  companyId: string
  event: ZapierEventType
  data: Record<string, unknown>
}) {
  const url = input.webhookUrl.trim()
  if (!isValidZapierWebhookUrl(url)) return { delivered: false, reason: 'invalid_url' as const }

  const payload = buildZapierPayload({
    companyId: input.companyId,
    event: input.event,
    data: input.data,
  })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return {
      delivered: response.ok,
      reason: response.ok ? ('ok' as const) : (`http_${response.status}` as const),
    }
  } catch {
    return { delivered: false, reason: 'network_error' as const }
  }
}

export async function dispatchCompanyZapierEvent(
  supabaseAdmin: SupabaseAdminLike,
  input: {
    companyId: string
    event: ZapierEventType
    data: Record<string, unknown>
  }
) {
  const { data: integration } = await supabaseAdmin
    .from('company_integrations')
    .select('status, config')
    .eq('company_id', input.companyId)
    .eq('provider', 'zapier')
    .maybeSingle()

  if (!integration || integration.status !== 'connected') {
    return { delivered: false, reason: 'not_connected' as const }
  }

  const webhookUrl = getZapierWebhookUrl(integration.config || {})
  return dispatchZapierEvent({
    webhookUrl,
    companyId: input.companyId,
    event: input.event,
    data: input.data,
  })
}

/** Fire-and-forget Zapier dispatch; never blocks the caller. */
export function queueCompanyZapierEvent(
  supabaseAdmin: SupabaseAdminLike,
  input: {
    companyId: string
    event: ZapierEventType
    data: Record<string, unknown>
  }
) {
  void dispatchCompanyZapierEvent(supabaseAdmin, input).then((result) => {
    if (!result.delivered && result.reason !== 'not_connected') {
      console.error(
        `Zapier dispatch failed (${input.event}):`,
        result.reason,
        input.companyId
      )
    }
  })
}