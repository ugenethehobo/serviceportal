import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import packageJson from '@/package.json'
import {
  getEnvCheckStatuses,
  HEALTH_ENV_VARS,
  HEALTH_RECOMMENDED_ENV_VARS,
} from '@/lib/env-validation'
import { probeStripeWebhookEventsTable } from '@/lib/stripe-webhook'

export const dynamic = 'force-dynamic'

type CheckStatus = 'ok' | 'missing' | 'error'

export async function GET() {
  const checks: Record<string, CheckStatus> = {
    ...getEnvCheckStatuses(HEALTH_ENV_VARS),
  }

  const recommended = getEnvCheckStatuses(HEALTH_RECOMMENDED_ENV_VARS)

  let database: CheckStatus = 'missing'
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (url && serviceRoleKey) {
    try {
      const supabase = createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { error } = await supabase.from('companies').select('id').limit(1)
      database = error ? 'error' : 'ok'

      if (!error) {
        checks.stripeWebhookEventsTable = await probeStripeWebhookEventsTable(supabase)
      } else {
        checks.stripeWebhookEventsTable = 'missing'
      }
    } catch {
      database = 'error'
      checks.stripeWebhookEventsTable = 'error'
    }
  } else {
    checks.stripeWebhookEventsTable = 'missing'
  }

  checks.database = database

  const requiredOk = HEALTH_ENV_VARS.every((name) => checks[name] === 'ok')
  const ok = requiredOk && database === 'ok'

  return NextResponse.json(
    {
      ok,
      service: 'service-portal-v2',
      version: packageJson.version,
      checks,
      recommended,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  )
}