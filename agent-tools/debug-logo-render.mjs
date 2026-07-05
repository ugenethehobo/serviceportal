import { readFileSync, writeFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
function getEnv(key) {
  const match = env.match(new RegExp(`^${key}=(.+)$`, 'm'))
  return match ? match[1].trim().replace(/\r$/, '') : ''
}
process.env.NEXT_PUBLIC_SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL')
process.env.SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')

const { createClient } = await import('@supabase/supabase-js')
const { renderDocumentPdf } = await import('../lib/document-template-renderer.ts')
const { loadCompanyLogoBytesForPdf } = await import('../lib/document-template-logo-server.ts')
const { DEFAULT_INVOICE_DOCUMENT_TEMPLATE } = await import('../lib/document-template.ts')
const { SAMPLE_INVOICE_RENDER_DATA } = await import('../lib/document-template-sample.ts')

const sb = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: company } = await sb
  .from('companies')
  .select('id,name,logo_url')
  .eq('name', 'Test Landscaping')
  .single()

console.log('company', company?.id)

const { data: row } = await sb.from('companies').select('logo_url').eq('id', company.id).single()
console.log('logo_url from db', row?.logo_url?.slice(0, 80))

const fetchRes = await fetch(row.logo_url)
console.log('direct fetch', fetchRes.status, fetchRes.headers.get('content-type'))

const logoBytes = await loadCompanyLogoBytesForPdf(company.id)
console.log('loadCompanyLogoBytesForPdf', logoBytes?.length ?? null)

const template = structuredClone(DEFAULT_INVOICE_DOCUMENT_TEMPLATE)
const logoEl = template.elements.find((e) => e.id === 'company-logo')
if (logoEl) logoEl.visible = true

const pdfBytes = await renderDocumentPdf({
  ...SAMPLE_INVOICE_RENDER_DATA,
  template,
  company: {
    ...SAMPLE_INVOICE_RENDER_DATA.company,
    logoBytes,
  },
})

const pdfText = Buffer.from(pdfBytes).toString('latin1')
console.log('pdf bytes', pdfBytes.length)
console.log('pdf has Image', pdfText.includes('/Subtype /Image'))
writeFileSync('agent-tools/test-logo-preview.pdf', Buffer.from(pdfBytes))
console.log('wrote agent-tools/test-logo-preview.pdf')