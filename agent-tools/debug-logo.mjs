import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument } from 'pdf-lib'

const STORAGE_BUCKET = 'company-logos'

function getCompanyLogoStoragePath(logoRef) {
  if (!logoRef?.trim()) return null
  const trimmed = logoRef.trim()
  if (!trimmed.startsWith('http')) return trimmed.replace(/^\/+/, '')
  try {
    const url = new URL(trimmed)
    const publicMarker = `/object/public/${STORAGE_BUCKET}/`
    const publicIndex = url.pathname.indexOf(publicMarker)
    if (publicIndex >= 0) {
      return decodeURIComponent(url.pathname.slice(publicIndex + publicMarker.length))
    }
    const signMarker = `/object/sign/${STORAGE_BUCKET}/`
    const signIndex = url.pathname.indexOf(signMarker)
    if (signIndex >= 0) {
      return decodeURIComponent(url.pathname.slice(signIndex + signMarker.length))
    }
  } catch {
    return null
  }
  return null
}

const env = readFileSync('.env.local', 'utf8')
function getEnv(key) {
  const match = env.match(new RegExp(`^${key}=(.+)$`, 'm'))
  return match ? match[1].trim() : ''
}

const url = getEnv('NEXT_PUBLIC_SUPABASE_URL')
const key = getEnv('SUPABASE_SERVICE_ROLE_KEY')
const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: companies, error } = await sb
  .from('companies')
  .select('id,name,logo_url')
  .not('logo_url', 'is', null)
  .limit(5)

if (error) {
  console.error('query error', error.message)
  process.exit(1)
}

console.log('companies with logo:', companies?.length ?? 0)

for (const company of companies ?? []) {
  console.log('\n---', company.name)
  console.log('logo_url:', company.logo_url)

  const storagePath = getCompanyLogoStoragePath(company.logo_url)
  console.log('storagePath:', storagePath)

  let bytes = null

  if (storagePath) {
    const { data, error: dlError } = await sb.storage
      .from('company-logos')
      .download(storagePath)
    console.log('download:', dlError?.message ?? 'ok', data ? `${data.size} bytes` : 'no data')
    if (data) bytes = new Uint8Array(await data.arrayBuffer())
  } else if (company.logo_url?.startsWith('http')) {
    const res = await fetch(company.logo_url)
    console.log('fetch:', res.status, res.headers.get('content-type'))
    if (res.ok) bytes = new Uint8Array(await res.arrayBuffer())
  }

  if (!bytes?.length) {
    console.log('embed: skipped (no bytes)')
    continue
  }

  const head = [...bytes.slice(0, 4)].map((b) => b.toString(16)).join(' ')
  console.log('magic:', head)

  const pdf = await PDFDocument.create()
  try {
    if (bytes[0] === 0x89) {
      await pdf.embedPng(bytes)
      console.log('embedPng: ok')
    } else {
      await pdf.embedJpg(bytes)
      console.log('embedJpg: ok')
    }
  } catch (embedError) {
    console.log('embed failed:', embedError.message)
  }
}