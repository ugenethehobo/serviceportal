import { createClient } from '@supabase/supabase-js'
import { getCompanyLogoStoragePath } from '@/lib/company-logo'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function resolveCompanyLogoUrl(
  logoRef: string | null | undefined
): Promise<string | null> {
  if (!logoRef?.trim()) return null

  if (logoRef.trim().startsWith('http')) {
    return logoRef.trim()
  }

  const storagePath = getCompanyLogoStoragePath(logoRef)
  if (!storagePath) return null

  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin.storage
    .from('company-logos')
    .createSignedUrl(storagePath, 60 * 60)

  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

async function loadCompanyLogoRef(companyId: string): Promise<string | null> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data } = await supabaseAdmin
    .from('companies')
    .select('logo_url')
    .eq('id', companyId)
    .single()

  return data?.logo_url ?? null
}

export async function loadCompanyLogoBytesForPdf(
  companyId: string
): Promise<Uint8Array | null> {
  const logoRef = await loadCompanyLogoRef(companyId)
  if (!logoRef?.trim()) return null

  const trimmed = logoRef.trim()
  const storagePath = getCompanyLogoStoragePath(trimmed)

  if (storagePath) {
    const supabaseAdmin = createSupabaseAdmin()
    const { data, error } = await supabaseAdmin.storage
      .from('company-logos')
      .download(storagePath)

    if (!error && data) {
      return new Uint8Array(await data.arrayBuffer())
    }
  }

  if (trimmed.startsWith('http')) {
    const { loadLogoBytesFromUrl } = await import('@/lib/document-template-logo-embed')
    return loadLogoBytesFromUrl(trimmed)
  }

  return null
}

/** @deprecated Prefer loadCompanyLogoBytesForPdf for PDF rendering. */
export async function loadCompanyLogoUrlForPdf(
  companyId: string
): Promise<string | null> {
  const logoRef = await loadCompanyLogoRef(companyId)
  return resolveCompanyLogoUrl(logoRef)
}