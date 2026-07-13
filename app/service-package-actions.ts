'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import {
  normalizeServicePackageDescription,
  normalizeServicePackageDraft,
  type ServicePackage,
} from '@/lib/service-packages'
import {
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyCompanyStaffForPackages() {
  const session = await getSessionProfile()
  if (!session) {
    return { ok: false as const, error: 'Not authenticated' }
  }
  if (!session.profile.company_id) {
    return { ok: false as const, error: 'No company associated with this account' }
  }
  if (!isStaffRole(session.profile.role)) {
    return { ok: false as const, error: 'Unauthorized' }
  }

  const subscription = await verifyStaffSubscriptionAccess(session.profile.company_id)
  if (!subscription.ok) {
    return { ok: false as const, error: TRIAL_EXPIRED_ERROR }
  }

  return {
    ok: true as const,
    companyId: session.profile.company_id,
    role: session.profile.role,
  }
}

export async function getServicePackagesAction(options?: {
  activeOnly?: boolean
}): Promise<
  | { success: true; packages: ServicePackage[] }
  | { success: false; error: string }
> {
  const check = await verifyCompanyStaffForPackages()
  if (!check.ok) return { success: false, error: check.error }

  const supabaseAdmin = createSupabaseAdmin()
  let query = supabaseAdmin
    .from('bookable_services')
    .select('*')
    .eq('company_id', check.companyId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (options?.activeOnly) {
    query = query.eq('active', true)
  }

  const { data, error } = await query

  if (error) {
    if (error.code === '42703') {
      return {
        success: false,
        error: 'Service packages are not enabled yet. Run supabase/booking-schema.sql.',
      }
    }
    return { success: false, error: error.message }
  }

  return { success: true, packages: (data || []) as ServicePackage[] }
}

export async function updateServicePackagesAction(
  packages: Array<{
    id?: string
    name: string
    description?: string | null
    duration_minutes: number
    price_estimate?: number | null
    active: boolean
  }>
): Promise<{ success: true } | { success: false; error: string }> {
  const check = await verifyCompanyStaffForPackages()
  if (!check.ok) return { success: false, error: check.error }
  if (check.role !== 'company_admin') {
    return { success: false, error: 'Only admins can update service packages' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  const { data: existingPackages } = await supabaseAdmin
    .from('bookable_services')
    .select('id')
    .eq('company_id', check.companyId)

  const existingIds = new Set((existingPackages || []).map((pkg) => pkg.id))
  const retainedIds = new Set<string>()

  for (const [index, pkg] of packages.entries()) {
    if (!pkg.name.trim()) continue

    const payload = {
      company_id: check.companyId,
      name: pkg.name.trim(),
      description:
        pkg.description == null
          ? null
          : normalizeServicePackageDescription(pkg.description),
      duration_minutes: Math.min(480, Math.max(15, Math.round(pkg.duration_minutes || 60))),
      price_estimate: pkg.price_estimate ?? null,
      active: pkg.active,
      sort_order: index,
      updated_at: new Date().toISOString(),
    }

    if (pkg.id && existingIds.has(pkg.id)) {
      retainedIds.add(pkg.id)
      await supabaseAdmin.from('bookable_services').update(payload).eq('id', pkg.id)
    } else {
      await supabaseAdmin.from('bookable_services').insert(payload)
    }
  }

  const deleteIds = [...existingIds].filter((id) => !retainedIds.has(id))
  if (deleteIds.length > 0) {
    await supabaseAdmin.from('bookable_services').delete().in('id', deleteIds)
  }

  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function countActiveServicePackages(companyId: string) {
  const check = await verifyCompanyStaffForPackages()
  if (!check.ok || check.companyId !== companyId) {
    return 0
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { count, error } = await supabaseAdmin
    .from('bookable_services')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('active', true)

  if (error) return 0
  return count || 0
}