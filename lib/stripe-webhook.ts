import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'

export type StripeWebhookSource = 'connect' | 'billing'

export type ParsedStripeWebhook =
  | { ok: true; event: Stripe.Event }
  | { ok: false; status: number; error: string }

export function parseStripeWebhookRequest(
  body: string,
  signature: string | null,
  secret: string | undefined
): ParsedStripeWebhook {
  if (!signature || !secret?.trim()) {
    return { ok: false, status: 400, error: 'Webhook not configured' }
  }

  try {
    const event = stripe.webhooks.constructEvent(body, signature, secret.trim())
    return { ok: true, event }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid signature'
    console.error('Stripe webhook signature verification failed:', message)
    return { ok: false, status: 400, error: 'Invalid signature' }
  }
}

export async function isDuplicateStripeWebhookEvent(
  supabase: SupabaseClient,
  eventId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('stripe_webhook_events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle()

  if (error?.code === '42P01') {
    return false
  }
  if (error) {
    console.error('stripe_webhook_events lookup error:', error)
    return false
  }

  return Boolean(data)
}

export async function recordStripeWebhookEvent(
  supabase: SupabaseClient,
  event: Stripe.Event,
  source: StripeWebhookSource
): Promise<void> {
  const { error } = await supabase.from('stripe_webhook_events').insert({
    id: event.id,
    source,
    event_type: event.type,
  })

  if (error?.code === '42P01') return
  if (error?.code === '23505') return
  if (error) {
    console.error('stripe_webhook_events insert error:', error)
  }
}

export async function probeStripeWebhookEventsTable(
  supabase: SupabaseClient
): Promise<'ok' | 'missing' | 'error'> {
  const { error } = await supabase.from('stripe_webhook_events').select('id').limit(1)
  if (!error) return 'ok'

  const message = error.message.toLowerCase()
  if (
    error.code === '42P01' ||
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('relation')
  ) {
    return 'missing'
  }

  return 'error'
}