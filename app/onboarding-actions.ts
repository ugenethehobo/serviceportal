'use server'

import { revalidatePath } from 'next/cache'
import { countActiveServicePackages } from '@/app/service-package-actions'
import {
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'
import { normalizeAccentColor } from '@/lib/personalization'
import { createSupabaseAdmin } from '@/lib/portal-auth'

async function verifyOnboardingAdmin() {
  const session = await getSessionProfile()
  if (!session) {
    return { ok: false as const, error: 'Not authenticated' }
  }
  if (session.profile.role !== 'company_admin') {
    return { ok: false as const, error: 'Only company admins can complete onboarding' }
  }
  if (!session.profile.company_id) {
    return { ok: false as const, error: 'No company associated with this account' }
  }

  const subscription = await verifyStaffSubscriptionAccess(session.profile.company_id)
  if (!subscription.ok) {
    return { ok: false as const, error: TRIAL_EXPIRED_ERROR }
  }

  return {
    ok: true as const,
    companyId: session.profile.company_id,
    userId: session.userId,
  }
}

export async function getOnboardingStatusAction(): Promise<
  | {
      success: true
      completed: boolean
      companyName: string
    }
  | { success: false; error: string }
> {
  const check = await verifyOnboardingAdmin()
  if (!check.ok) return { success: false, error: check.error }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: company, error } = await supabaseAdmin
    .from('companies')
    .select('name, onboarding_completed')
    .eq('id', check.companyId)
    .single()

  if (error) {
    if (error.code === '42703') {
      return { success: true, completed: true, companyName: '' }
    }
    return { success: false, error: error.message }
  }

  return {
    success: true,
    completed: company?.onboarding_completed ?? true,
    companyName: company?.name || '',
  }
}

export async function getOnboardingInitialDataAction(): Promise<
  | {
      success: true
      account: {
        fullName: string
        email: string
        avatarUrl: string | null
        accentColor: string | null
        backgroundImageUrl: string | null
      }
      company: {
        name: string | null
        logo_url: string | null
        timezone: string | null
        business_hours_start: string | null
        business_hours_end: string | null
        business_open_weekdays: number[] | null
        address: string | null
        address_street: string | null
        address_unit: string | null
        address_city: string | null
        address_state: string | null
        address_zip: string | null
        is_solo_business: boolean | null
        booking_slug: string | null
      }
    }
  | { success: false; error: string }
> {
  const session = await getSessionProfile()
  if (!session || !isStaffRole(session.profile.role)) {
    return { success: false, error: 'Not authenticated' }
  }
  if (session.profile.role !== 'company_admin' || !session.profile.company_id) {
    return { success: false, error: 'Only company admins can access onboarding' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  const [{ data: profile }, { data: authData }, { data: company }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('full_name, avatar_url, email')
      .eq('id', session.userId)
      .single(),
    supabaseAdmin.auth.admin.getUserById(session.userId),
    supabaseAdmin
      .from('companies')
      .select(`
        name,
        logo_url,
        timezone,
        business_hours_start,
        business_hours_end,
        business_open_weekdays,
        address,
        address_street,
        address_unit,
        address_city,
        address_state,
        address_zip,
        is_solo_business,
        booking_slug,
        accent_color,
        background_image_url
      `)
      .eq('id', session.profile.company_id)
      .single(),
  ])

  if (!profile || !company) {
    return { success: false, error: 'Could not load onboarding data' }
  }

  const { resolveBackgroundDisplayUrl } = await import('@/lib/personalization-server')
  const backgroundImageUrl = await resolveBackgroundDisplayUrl(company.background_image_url)

  return {
    success: true,
    account: {
      fullName: profile.full_name || '',
      email: authData?.user?.email || profile.email || '',
      avatarUrl: profile.avatar_url,
      accentColor: normalizeAccentColor(company.accent_color),
      backgroundImageUrl,
    },
    company,
  }
}

export async function validateOnboardingCompanyAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  const check = await verifyOnboardingAdmin()
  if (!check.ok) return { success: false, error: check.error }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: company, error } = await supabaseAdmin
    .from('companies')
    .select('name, address_street, address_city, address_state, address_zip')
    .eq('id', check.companyId)
    .single()

  if (error || !company) {
    return { success: false, error: 'Could not load company settings' }
  }

  if (!company.name?.trim()) {
    return { success: false, error: 'Company name is required' }
  }

  if (!company.address_street?.trim() || !company.address_city?.trim()) {
    return { success: false, error: 'Complete your office address to continue' }
  }

  return { success: true }
}

export async function finalizeOnboardingAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  const check = await verifyOnboardingAdmin()
  if (!check.ok) return { success: false, error: check.error }

  const supabaseAdmin = createSupabaseAdmin()

  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .select('name, address_street, address_city, address_state, address_zip')
    .eq('id', check.companyId)
    .single()

  if (companyError || !company) {
    return { success: false, error: 'Company not found' }
  }

  if (!company.name?.trim()) {
    return { success: false, error: 'Company name is required' }
  }

  if (!company.address_street?.trim() || !company.address_city?.trim()) {
    return { success: false, error: 'Office address is required' }
  }

  const packageCount = await countActiveServicePackages(check.companyId)
  if (packageCount === 0) {
    return { success: false, error: 'Add at least one active service package' }
  }

  const { error: updateError } = await supabaseAdmin
    .from('companies')
    .update({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', check.companyId)

  if (updateError) {
    if (updateError.code === '42703') {
      return { success: true }
    }
    return { success: false, error: updateError.message }
  }

  revalidatePath('/dashboard')
  revalidatePath('/onboarding')

  return { success: true }
}