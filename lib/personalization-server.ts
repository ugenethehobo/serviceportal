import { cache } from 'react'
import { createSupabaseAdmin, getSessionProfile, isStaffRole } from '@/lib/portal-auth'
import {
  normalizeAccentColor,
  type PersonalizationState,
} from '@/lib/personalization'

export const PERSONALIZATION_BACKGROUND_BUCKET = 'user-backgrounds'

function getBackgroundStoragePath(reference: string | null | undefined): string | null {
  if (!reference?.trim()) return null
  const trimmed = reference.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return null
  }
  if (trimmed.includes(`/${PERSONALIZATION_BACKGROUND_BUCKET}/`)) {
    return trimmed.split(`/${PERSONALIZATION_BACKGROUND_BUCKET}/`)[1]?.split('?')[0] || null
  }
  return trimmed.split('?')[0] || null
}

export async function resolveBackgroundDisplayUrl(
  reference: string | null | undefined
): Promise<string | null> {
  if (!reference?.trim()) return null
  const trimmed = reference.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }

  const storagePath = getBackgroundStoragePath(trimmed) ?? trimmed
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin.storage
    .from(PERSONALIZATION_BACKGROUND_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7)

  if (error || !data?.signedUrl) {
    return null
  }

  return data.signedUrl
}

export async function getPersonalizationCompanyId(
  session: NonNullable<Awaited<ReturnType<typeof getSessionProfile>>>
): Promise<string | null> {
  if (isStaffRole(session.profile.role) && session.profile.company_id) {
    return session.profile.company_id
  }

  if (session.profile.role === 'client' && session.profile.client_id) {
    const supabaseAdmin = createSupabaseAdmin()
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('company_id')
      .eq('id', session.profile.client_id)
      .single()

    return client?.company_id ?? null
  }

  return null
}

export async function getCompanyPersonalization(
  companyId: string
): Promise<PersonalizationState> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('accent_color, background_image_url')
    .eq('id', companyId)
    .single()

  if (!company) {
    return { accentColor: null, backgroundImageUrl: null }
  }

  const accentColor = normalizeAccentColor(company.accent_color)
  const backgroundImageUrl = await resolveBackgroundDisplayUrl(company.background_image_url)

  return {
    accentColor,
    backgroundImageUrl,
  }
}

export const getUserPersonalization = cache(async (): Promise<PersonalizationState> => {
  const session = await getSessionProfile()
  if (!session) {
    return { accentColor: null, backgroundImageUrl: null }
  }

  const companyId = await getPersonalizationCompanyId(session)
  if (!companyId) {
    return { accentColor: null, backgroundImageUrl: null }
  }

  return getCompanyPersonalization(companyId)
})