/**
 * Probes the linked Supabase project for schema markers from DEPLOYMENT.md migrations.
 * Usage: node scripts/verify-schema.mjs
 * Loads .env.local when present (dotenv-free: manual parse).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvFile(filename) {
  const path = resolve(root, filename)
  if (!existsSync(path)) return

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadEnvFile('.env.local')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function columnExists(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1)
  if (!error) return true
  const message = error.message.toLowerCase()
  if (message.includes('does not exist') || message.includes('could not find')) {
    return false
  }
  throw new Error(`${table}.${column}: ${error.message}`)
}

async function tableQueryable(table, columns = 'id') {
  const { error } = await supabase.from(table).select(columns).limit(1)
  if (!error) return true
  const message = error.message.toLowerCase()
  if (
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('relation') ||
    message.includes('schema cache')
  ) {
    return false
  }
  throw new Error(`${table}: ${error.message}`)
}

async function bucketExists(bucketId) {
  const { data, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`storage.listBuckets: ${error.message}`)
  return data.some((bucket) => bucket.id === bucketId || bucket.name === bucketId)
}

const checks = [
  {
    migration: 'schema-baseline.sql',
    label: 'Core tables',
    run: async () =>
      (await tableQueryable('companies')) &&
      (await tableQueryable('profiles')) &&
      (await tableQueryable('clients')) &&
      (await tableQueryable('schedules')),
  },
  {
    migration: 'recurring-rules-schema.sql',
    label: 'recurring_rules table',
    run: async () => tableQueryable('recurring_rules'),
  },
  {
    migration: 'billing-schema.sql',
    label: 'billing tables',
    run: async () =>
      (await tableQueryable('billing_line_items')) &&
      (await tableQueryable('billing_payments')),
  },
  {
    migration: 'integrations-schema.sql',
    label: 'company_integrations',
    run: async () => tableQueryable('company_integrations'),
  },
  {
    migration: 'booking-schema.sql',
    label: 'bookable_services',
    run: async () => tableQueryable('bookable_services'),
  },
  {
    migration: 'google-calendar-schema.sql',
    label: 'schedules.google_calendar_event_id',
    run: async () => columnExists('schedules', 'google_calendar_event_id'),
  },
  {
    migration: 'onboarding-schema.sql',
    label: 'companies.onboarding_completed',
    run: async () => columnExists('companies', 'onboarding_completed'),
  },
  {
    migration: 'personalization-schema.sql',
    label: 'companies.accent_color + background_image_url',
    run: async () =>
      (await columnExists('companies', 'accent_color')) &&
      (await columnExists('companies', 'background_image_url')),
  },
  {
    migration: 'user-backgrounds-storage.sql',
    label: 'user-backgrounds bucket',
    run: async () => bucketExists('user-backgrounds'),
  },
  {
    migration: 'recurring-occurrence-origin.sql',
    label: 'schedules.occurrence_origin_start',
    run: async () => columnExists('schedules', 'occurrence_origin_start'),
  },
  {
    migration: 'production-rls-hardening.sql',
    label: 'crews table queryable (RLS applied in SQL editor)',
    run: async () => tableQueryable('crews'),
  },
  {
    migration: 'company-logos-storage.sql',
    label: 'company-logos bucket',
    run: async () => bucketExists('company-logos'),
  },
]

console.log(`Verifying Supabase schema: ${url}\n`)

const results = []
let passCount = 0

for (const check of checks) {
  try {
    const ok = await check.run()
    results.push({ ...check, ok, error: null })
    if (ok) passCount += 1
  } catch (error) {
    results.push({
      ...check,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const width = Math.max(...results.map((r) => r.migration.length), 10)
for (const result of results) {
  const status = result.error ? 'ERR' : result.ok ? 'OK ' : 'MISS'
  const suffix = result.error ? ` — ${result.error}` : result.ok ? '' : ` — ${result.label}`
  console.log(`${status}  ${result.migration.padEnd(width)}  ${suffix}`)
}

const missing = results.filter((r) => !r.ok && !r.error)
const errors = results.filter((r) => r.error)

console.log(`\n${passCount}/${results.length} checks passed.`)

if (missing.length) {
  console.log('\nRun these migrations in the Supabase SQL editor (in order):')
  for (const item of missing) {
    console.log(`  - supabase/${item.migration}`)
  }
}

if (errors.length) {
  console.log('\nErrors (fix connectivity/permissions first):')
  for (const item of errors) {
    console.log(`  - ${item.migration}: ${item.error}`)
  }
  process.exit(2)
}

process.exit(missing.length ? 1 : 0)