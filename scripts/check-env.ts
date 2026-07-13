import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PRODUCTION_ONLY_ENV_VARS,
  RECOMMENDED_ENV_VARS,
  REQUIRED_ENV_VARS,
  validateEnvironment,
} from '../lib/env-validation'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const isProduction = process.argv.includes('--production')

function loadEnvFile(filename: string) {
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

const result = validateEnvironment({ production: isProduction })

console.log(`Environment check (${isProduction ? 'production' : 'staging/local'})\n`)

for (const name of REQUIRED_ENV_VARS) {
  console.log(`${result.checks[name] === 'ok' ? 'OK ' : 'MISS'}  ${name}`)
}

if (isProduction) {
  console.log('\nProduction-only:')
  for (const name of PRODUCTION_ONLY_ENV_VARS) {
    console.log(`${result.checks[name] === 'ok' ? 'OK ' : 'MISS'}  ${name}`)
  }
}

if (result.missingRecommended.length) {
  console.log('\nRecommended (optional features):')
  for (const name of RECOMMENDED_ENV_VARS) {
    console.log(`${result.checks[name] === 'ok' ? 'OK ' : '----'}  ${name}`)
  }
}

for (const warning of result.warnings) {
  console.log(`\nWARN  ${warning}`)
}

if (!result.ok) {
  console.log('\nSet missing variables in Vercel → Project → Settings → Environment Variables.')
  process.exit(1)
}

console.log('\nAll required variables are set.')