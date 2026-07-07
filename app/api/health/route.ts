import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

type CheckStatus = 'ok' | 'missing' | 'error'

function envStatus(name: string): CheckStatus {
  return process.env[name]?.trim() ? 'ok' : 'missing'
}

export async function GET() {
  const checks: Record<string, CheckStatus> = {
    supabaseUrl: envStatus('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: envStatus('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: envStatus('SUPABASE_SERVICE_ROLE_KEY'),
    appUrl: envStatus('NEXT_PUBLIC_APP_URL'),
    stripeSecret: envStatus('STRIPE_SECRET_KEY'),
    resendApiKey: envStatus('RESEND_API_KEY'),
    cronSecret: envStatus('CRON_SECRET'),
  }

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
    } catch {
      database = 'error'
    }
  }

  checks.database = database

  const ok = Object.values(checks).every((status) => status === 'ok')

  return NextResponse.json(
    {
      ok,
      service: 'service-portal-v2',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  )
}