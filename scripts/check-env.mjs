/**
 * Validates environment variables for staging/production deploys.
 * Usage: node scripts/check-env.mjs [--production]
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const isProduction = process.argv.includes('--production')

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

function has(name) {
  return Boolean(process.env[name]?.trim())
}

function isLocalAppUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? ''
  return !value || value.includes('localhost') || value.includes('127.0.0.1')
}

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_ADMIN_EMAIL',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'CRON_SECRET',
  'STRIPE_PLATFORM_PRICE_BASIC',
  'STRIPE_PLATFORM_PRICE_PRO',
]

const productionOnly = [
  'QUICKBOOKS_OAUTH_STATE_SECRET',
  'GOOGLE_CALENDAR_OAUTH_STATE_SECRET',
]

const recommended = [
  'STRIPE_BILLING_WEBHOOK_SECRET',
  'QUICKBOOKS_CLIENT_ID',
  'QUICKBOOKS_CLIENT_SECRET',
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
]

const missingRequired = required.filter((name) => !has(name))
const missingProduction = isProduction
  ? productionOnly.filter((name) => !has(name))
  : []
const missingRecommended = recommended.filter((name) => !has(name))

console.log(`Environment check (${isProduction ? 'production' : 'staging/local'})\n`)

for (const name of required) {
  console.log(`${has(name) ? 'OK ' : 'MISS'}  ${name}`)
}

if (isProduction) {
  console.log('\nProduction-only:')
  for (const name of productionOnly) {
    console.log(`${has(name) ? 'OK ' : 'MISS'}  ${name}`)
  }
}

if (missingRecommended.length) {
  console.log('\nRecommended (optional features):')
  for (const name of recommended) {
    console.log(`${has(name) ? 'OK ' : '----'}  ${name}`)
  }
}

if (isProduction && isLocalAppUrl()) {
  console.log('\nWARN  NEXT_PUBLIC_APP_URL still points at localhost — set your Vercel URL.')
}

if (isProduction && has('STRIPE_SECRET_KEY')) {
  const stripeKey = process.env.STRIPE_SECRET_KEY.trim()
  if (stripeKey.startsWith('sk_test_')) {
    console.log('\nWARN  STRIPE_SECRET_KEY is test mode — use live keys for production billing.')
  }
}

const exitCode =
  missingRequired.length || missingProduction.length ? 1 : 0

if (exitCode) {
  console.log('\nSet missing variables in Vercel → Project → Settings → Environment Variables.')
  process.exit(exitCode)
}

console.log('\nAll required variables are set.')