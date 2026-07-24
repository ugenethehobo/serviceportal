'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { normalizeBookingSettings } from '@/lib/booking'
import {
  checkJobConflict,
  suggestAlternativeCrews
} from '@/lib/scheduling'
import {
  calcBillingSummary,
  calcLineAmount,
  type CompanyPaymentRow,
  type PaymentsSummary,
} from '@/lib/billing'
import { seedBillingFromJobPrice, duplicateBillingToSchedule } from '@/lib/billing-server'
import { SYSTEM_DOCUMENT_CATEGORY_INVOICES } from '@/lib/document-categories'
import { syncJobInvoiceDocument } from '@/lib/invoices-server'
import {
  countMtdJobOccurrences,
  sumRecordedPaymentsInPeriod,
  sumRecordedStripePaymentsInPeriod,
} from '@/lib/dashboard-month-kpis'
import { getCompanyStripeStatus, resolveMonthCollectedAmount } from '@/lib/stripe-connect'
import {
  recalcEstimateTotal,
  syncEstimateDocument,
  seedBillingFromEstimate,
  applyAutoEstimateStatus,
  notifyEstimateSentById,
} from '@/lib/estimates-server'
import {
  normalizeNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notifications'
import {
  notifyClientInvoiceSent,
  notifyClientMessageFromStaff,
  notifyStaffMessageFromClient,
  queueNotification,
} from '@/lib/notifications-server'
import { cookies } from 'next/headers'
import { cache } from 'react'
import {
  assertPlatformAdminSession,
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'
import { getCompanySubscriptionAccessForCompany } from '@/lib/platform-trial-server'
import {
  isThemePreference,
  THEME_COOKIE_NAME,
  type ThemePreference,
} from '@/lib/theme'
import {
  formatUpcomingOpenDaysRangeLabel,
  getClosedDayError,
  getNextOpenDayDates,
  isClosedDayToday,
  isOpenAtInstant,
  normalizeBusinessHours,
  isValidBusinessHoursRange,
  shouldShowTomorrowTimeline,
  UPCOMING_OPEN_DAYS_PREVIEW_COUNT,
  type BusinessHours,
} from '@/lib/business-hours'
import { formatCompanyDateLabel, getCompanyDayBounds } from '@/lib/timezone'
import {
  assignTimelineLanes,
  buildCrewSummaries,
  buildTimelineJobs,
  type DashboardMonthlyKpis,
  type DashboardOverviewData,
} from '@/lib/dashboard-overview'
import { buildDashboardMapData, type DashboardMapData } from '@/lib/dashboard-map'
import { buildRoutePlannerData, type RoutePlannerData } from '@/lib/route-planner'
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_PRIORITIES,
  type Lead,
  type LeadActivity,
  type LeadPriority,
  type LeadSource,
  type LeadStatus,
} from '@/lib/leads'
import {
  DEFAULT_CLIENTS_PAGE_SIZE,
  DEFAULT_PAYMENTS_PAGE_SIZE,
  fetchBillingRowsForScheduleIds,
  fetchCompanyPaymentsPage,
  fetchCompanyPaymentsSummary,
  fetchMtdDashboardSchedules,
  fetchReportsBillingBundle,
  mapPaymentRow,
  type PaymentsFilterSource,
} from '@/lib/billing-queries'
import {
  buildReportsData,
  getReportsPeriodBounds,
  getReportsPeriodStart,
  type ReportsData,
  type ReportsPeriod,
} from '@/lib/reports'
import {
  buildTeamMemberJobs,
  buildTeamMemberRouteData,
  mergeTeamMemberDaySchedules,
  structuredAddressFromCompany,
  type TeamMemberDashboardData,
} from '@/lib/team-dashboard'
import {
  normalizeJobPhotoCategories,
  normalizePhotoCategory,
  validateJobPhotoCategories,
  type JobPhotoCategory,
} from '@/lib/job-photo-categories'
import {
  DEFAULT_JOB_PHOTO_CATEGORY,
  JOB_PHOTO_ACCEPTED_TYPES,
  JOB_PHOTO_BUCKET,
  JOB_PHOTO_MAX_BYTES,
  type JobPhoto,
  type JobPhotoWithUrl,
} from '@/lib/job-photos'
import {
  formatPhotoStorageBytes,
  getPhotoStorageFullMessage,
  getPhotoStorageLimitForPlan,
  wouldExceedPhotoStorage,
} from '@/lib/job-photo-storage'
import {
  normalizeDocumentCategories,
  resolveUploadCategory,
  validateDocumentCategories,
  type DocumentCategory,
} from '@/lib/document-categories'
import {
  CLIENT_DOCUMENTS_BUCKET,
  normalizeUploadedDocumentRows,
  UPLOADED_DOCUMENT_ACCEPTED_TYPES,
  UPLOADED_DOCUMENT_MAX_BYTES,
  type UploadedDocument,
} from '@/lib/uploaded-documents'
import {
  CLEARED_GEOCODE_FIELDS,
  geocodeClientAddressFields,
  geocodeCompanyAddressFields,
} from '@/lib/address-geocoding'
import {
  buildStructuredAddressDbFields,
  formatAddressForDisplay,
  normalizeStructuredAddress,
  structuredAddressFromCompanyRow,
  validateStructuredAddress,
  validateStructuredAddressIfPresent,
  type StructuredAddress,
} from '@/lib/address'
import {
  assertPortalEmailAvailable,
  findAuthUserByEmail,
  findProfileByEmail,
  isEmailAlreadyRegisteredError,
  linkClientPortalAccess,
  upsertClientPortalProfile,
} from '@/lib/portal-users'
import {
  validateMessageBody,
  type MessagingMessage,
  type MessagingThread,
} from '@/lib/messaging'
import {
  getOrCreateMessagingThread,
  insertMessagingMessage,
  listMessagingMessages,
  resolveStaffMessageSenderName,
  verifyScheduleBelongsToClient,
} from '@/lib/messaging-server'

export async function createCompanyUser(data: {
  email: string
  password: string
  displayName: string
  role: string
  avatarUrl?: string | null
  companyId: string
}) {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { success: false, error: adminCheck.error }
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  try {
    const { validatePassword } = await import('@/lib/password-policy')
    const passwordCheck = validatePassword(data.password)
    if (!passwordCheck.ok) {
      return {
        success: false,
        error: passwordCheck.error || 'Password does not meet requirements',
      }
    }

    const { countCompanySeats } = await import('@/lib/platform-signup-server')
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('seat_limit')
      .eq('id', data.companyId)
      .single()

    if (companyError) {
      return { success: false, error: companyError.message }
    }

    const seatsUsed = await countCompanySeats(supabaseAdmin, data.companyId)
    const seatLimit = Number(company?.seat_limit) || 10
    if (seatsUsed >= seatLimit) {
      return {
        success: false,
        error: `Seat limit reached (${seatLimit}). Upgrade your plan to add more team members.`,
      }
    }

    // 1. Create the user in auth.users
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.displayName,
        role: data.role,
        company_id: data.companyId,
      },
    })

    if (authError) {
      console.error('Auth createUser error:', authError)
      return { success: false, error: authError.message }
    }

    // 2. Insert into profiles table
    if (authData.user) {
      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: authData.user.id,
        full_name: data.displayName,
        email: data.email,
        avatar_url: data.avatarUrl || null,
        company_id: data.companyId,
        status: 'Active',
        role: data.role,
      })

      if (profileError) {
        console.error('Profiles insert error:', profileError)

        // Clean up: delete the auth user if profile insert fails
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)

        return { success: false, error: profileError.message }
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Unexpected error in createCompanyUser:', error)
    return { success: false, error: error.message }
  }
}

export async function getCompanyData(companyId: string) {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { company: null, users: [], error: adminCheck.error }
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  // Fetch company
  const { data: companyData } = await supabaseAdmin
    .from('companies')
    .select(
      'id, name, subscription_plan, subscription_status, seat_limit, trial_ends_at, created_at'
    )
    .eq('id', companyId)
    .single()

  // Fetch users
  const { data: usersData } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('company_id', companyId)

  const formattedUsers = usersData?.map((profile: any) => ({
    id: profile.id,
    name: profile.full_name || 'Unnamed User',
    email: profile.email || '',
    role: profile.role || 'User',
    status: profile.status || 'Active',
    avatar_url: profile.avatar_url,
  })) || []

  return {
    company: companyData,
    users: formattedUsers,
  }
}

export async function getDashboardData() {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { companies: [], totalUsers: 0, billingMetrics: null, error: adminCheck.error }
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  // Get all companies
  const { data: companiesData } = await supabaseAdmin
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })

  // Get all profiles for counting
  const { data: profilesData } = await supabaseAdmin
    .from('profiles')
    .select('company_id, role')

  // Build user counts
  const userCountMap: Record<string, number> = {}
  const seatCountMap: Record<string, number> = {}
  let totalUsers = 0

  if (profilesData) {
    profilesData.forEach((profile) => {
      if (profile.company_id) {
        userCountMap[profile.company_id] = (userCountMap[profile.company_id] || 0) + 1
        totalUsers++
        if (profile.role === 'company_admin' || profile.role === 'team_member') {
          seatCountMap[profile.company_id] = (seatCountMap[profile.company_id] || 0) + 1
        }
      }
    })
  }

  // Merge counts into companies
  const companiesWithCounts = companiesData?.map((company: any) => ({
    ...company,
    users: userCountMap[company.id] || 0,
    seats_used: seatCountMap[company.id] || 0,
  })) || []

  const { getPlatformMonthlyPriceMap } = await import('@/lib/platform-pricing-server')
  const { computePlatformMrr } = await import('@/lib/platform-billing')
  const monthlyPriceByPlan = await getPlatformMonthlyPriceMap()
  const billingMetrics = computePlatformMrr(companiesWithCounts, monthlyPriceByPlan)

  return {
    companies: companiesWithCounts,
    totalUsers,
    billingMetrics,
  }
}

async function assertPlatformAdmin() {
  return assertPlatformAdminSession()
}

export async function adminUpsertCompanyAction(data: {
  id?: string
  name: string
  address?: string | null
  phone?: string | null
  logo_url?: string | null
  subscription_plan: string
  subscription_status: string
  trial_ends_at?: string | null
}) {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { success: false as const, error: adminCheck.error }
  }

  if (!data.name.trim()) {
    return { success: false as const, error: 'Company name is required' }
  }

  const {
    getSeatLimitForPlan,
    getTrialEndsAt,
    normalizePlatformPlan,
    normalizeSubscriptionStatus,
  } = await import('@/lib/platform-billing')

  const plan = normalizePlatformPlan(data.subscription_plan)
  const status = normalizeSubscriptionStatus(data.subscription_status)
  const seat_limit = getSeatLimitForPlan(plan)

  let trial_ends_at = data.trial_ends_at ?? null
  if (plan === 'trial') {
    if (!trial_ends_at) {
      trial_ends_at = getTrialEndsAt()
    }
  } else {
    trial_ends_at = null
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  const payload = {
    name: data.name.trim(),
    address: data.address?.trim() || null,
    phone: data.phone?.trim() || null,
    logo_url: data.logo_url ?? null,
    subscription_plan: plan,
    subscription_status: status,
    seat_limit,
    trial_ends_at,
  }

  try {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from('companies')
        .update(payload)
        .eq('id', data.id)

      if (error) throw error
    } else {
      const { error } = await supabaseAdmin.from('companies').insert(payload)
      if (error) throw error
    }

    revalidatePath('/admin')
    return { success: true as const }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save company'
    return { success: false as const, error: message }
  }
}

function storageObjectPath(reference: string | null | undefined, bucket: string): string | null {
  if (!reference?.trim()) return null
  const trimmed = reference.trim()
  if (trimmed.includes(`/${bucket}/`)) {
    return trimmed.split(`/${bucket}/`)[1]?.split('?')[0] || null
  }
  return trimmed.split('?')[0] || null
}

export async function adminDeleteCompanyAction(companyId: string) {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { success: false as const, error: adminCheck.error }
  }

  if (!companyId?.trim()) {
    return { success: false as const, error: 'Company id is required' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id, name, logo_url')
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false as const, error: 'Company not found' }
    }

    const [{ data: staffProfiles }, { data: clientRows }] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id, avatar_url')
        .eq('company_id', companyId),
      supabaseAdmin
        .from('clients')
        .select('id, auth_user_id')
        .eq('company_id', companyId),
    ])

    const clientIds = (clientRows || []).map((row) => row.id)
    let portalProfiles: Array<{ id: string; avatar_url: string | null }> = []

    if (clientIds.length > 0) {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, avatar_url')
        .in('client_id', clientIds)
      portalProfiles = data || []
    }

    const usersToDelete = new Map<string, string | null>()
    for (const profile of staffProfiles || []) {
      usersToDelete.set(profile.id, profile.avatar_url)
    }
    for (const profile of portalProfiles) {
      usersToDelete.set(profile.id, profile.avatar_url)
    }
    for (const client of clientRows || []) {
      if (client.auth_user_id && !usersToDelete.has(client.auth_user_id)) {
        usersToDelete.set(client.auth_user_id, null)
      }
    }

    const userIds = [...usersToDelete.keys()]

    if (userIds.length > 0) {
      await supabaseAdmin.from('crews').update({ crew_lead_id: null }).in('crew_lead_id', userIds)
      await supabaseAdmin.from('profiles').update({ crew_id: null }).in('id', userIds)
    }

    const avatarPaths = [...usersToDelete.values()]
      .map((ref) => storageObjectPath(ref, 'user-avatars'))
      .filter((path): path is string => Boolean(path))

    if (avatarPaths.length > 0) {
      await supabaseAdmin.storage.from('user-avatars').remove(avatarPaths)
    }

    const logoPath = storageObjectPath(company.logo_url, 'company-logos')
    if (logoPath) {
      await supabaseAdmin.storage.from('company-logos').remove([logoPath])
    }

    const { data: jobPhotos, error: jobPhotosError } = await supabaseAdmin
      .from('job_photos')
      .select('storage_path')
      .eq('company_id', companyId)

    if (!jobPhotosError) {
      const photoPaths = (jobPhotos || [])
        .map((photo) => photo.storage_path)
        .filter((path): path is string => Boolean(path))

      if (photoPaths.length > 0) {
        await supabaseAdmin.storage.from('job-photos').remove(photoPaths)
      }
    }

    for (const userId of userIds) {
      await supabaseAdmin.from('profiles').delete().eq('id', userId)
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (authDeleteError) {
        throw new Error(authDeleteError.message || `Failed to delete user ${userId}`)
      }
    }

    const { error: deleteCompanyError } = await supabaseAdmin
      .from('companies')
      .delete()
      .eq('id', companyId)

    if (deleteCompanyError) {
      throw new Error(deleteCompanyError.message || 'Failed to delete company')
    }

    revalidatePath('/admin')
    revalidatePath(`/admin/companies/${companyId}`)

    return { success: true as const, deletedName: company.name }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete company'
    console.error('adminDeleteCompanyAction error:', error)
    return { success: false as const, error: message }
  }
}

export async function updateCompanyUser(data: {
  userId: string
  displayName: string
  password?: string
  role: string
  avatarUrl?: string | null
}) {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { success: false, error: adminCheck.error }
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  try {
    // Update auth user (password + metadata)
    const updateData: any = {
      user_metadata: {
        full_name: data.displayName,
        role: data.role,
      },
    }

    if (data.password) {
      updateData.password = data.password
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      updateData
    )

    if (authError) throw authError

    // Update profiles table
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: data.displayName,
        avatar_url: data.avatarUrl,
        role: data.role,
      })
      .eq('id', data.userId)

    if (profileError) throw profileError

    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function createCrew(data: {
  name: string
  memberIds: string[]
  crewLeadId?: string | null
  companyId: string
}) {
  const check = await verifyCompanyStaff()
  if (!check.ok) return { success: false, error: check.error }
  if (check.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: companyRow } = await supabaseAdmin
    .from('companies')
    .select('is_solo_business')
    .eq('id', data.companyId)
    .single()

  if (companyRow?.is_solo_business) {
    return {
      success: false,
      error:
        'Solo businesses use a single owner crew. Turn off solo mode in Settings → Company to manage multiple crews.',
    }
  }

  const { assertCompanyCrewCreationAllowed } = await import(
    '@/lib/platform-entitlements-server'
  )
  const crewGate = await assertCompanyCrewCreationAllowed(data.companyId)
  if (!crewGate.ok) return { success: false, error: crewGate.error }

  try {
    const { resolveValidCrewLeadId } = await import('@/lib/job-helpers')
    const crewLeadId = resolveValidCrewLeadId(
      data.memberIds,
      data.crewLeadId ?? null
    )
    if (data.crewLeadId && !crewLeadId) {
      return {
        success: false,
        error: 'Crew lead must be one of the selected crew members.',
      }
    }

    // Create the crew
    const { data: crewData, error: crewError } = await supabaseAdmin
      .from('crews')
      .insert({
        name: data.name,
        company_id: data.companyId,
        crew_lead_id: crewLeadId,
      })
      .select()
      .single()

    if (crewError) throw crewError

    // Assign selected members to the crew
    if (data.memberIds.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ crew_id: crewData.id })
        .in('id', data.memberIds)

      if (updateError) throw updateError
    }

    revalidatePath('/dashboard/crews')
    return { success: true }
  } catch (error: any) {
    console.error('Error creating crew:', error)
    return { success: false, error: error.message }
  }
}

export async function updateCrew(data: {
  crewId: string
  name: string
  crewLeadId?: string | null
  membersToAdd: string[]
  membersToRemove: string[]
}) {
  const access = await verifyCrewCompanyAccess(data.crewId)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  try {
    const { resolveValidCrewLeadId } = await import('@/lib/job-helpers')

    // 2. Remove members from crew
    if (data.membersToRemove.length > 0) {
      await supabaseAdmin
        .from('profiles')
        .update({ crew_id: null })
        .in('id', data.membersToRemove)
    }

    // 3. Add new members to crew
    if (data.membersToAdd.length > 0) {
      await supabaseAdmin
        .from('profiles')
        .update({ crew_id: data.crewId })
        .in('id', data.membersToAdd)
    }

    // Resolve final member set so lead must remain on the crew
    const { data: remainingMembers } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('crew_id', data.crewId)

    const memberIds = (remainingMembers || []).map((m) => m.id as string)
    const crewLeadId = resolveValidCrewLeadId(memberIds, data.crewLeadId ?? null)
    if (data.crewLeadId && !crewLeadId) {
      return {
        success: false,
        error: 'Crew lead must be a current member of this crew.',
      }
    }

    // 1. Update crew name and lead (after membership settles)
    const { error: crewError } = await supabaseAdmin
      .from('crews')
      .update({
        name: data.name,
        crew_lead_id: crewLeadId,
      })
      .eq('id', data.crewId)

    if (crewError) throw crewError

    revalidatePath('/dashboard/crews')
    return { success: true }
  } catch (error: any) {
    console.error('Error updating crew:', error)
    return { success: false, error: error.message }
  }
}

export async function createClientAction(data: {
  name: string
  contact_name?: string
  email?: string
  phone?: string
  address?: string
  clientAddress?: StructuredAddress
  notes?: string
  companyId: string
}) {
  const check = await verifyCompanyStaff()
  if (!check.ok) return { success: false, error: check.error }
  if (check.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    let addressFields: ReturnType<typeof buildStructuredAddressDbFields> | null = null

    if (data.clientAddress) {
      const normalized = normalizeStructuredAddress(data.clientAddress)
      const validation = validateStructuredAddressIfPresent(normalized)
      if (!validation.valid) {
        const firstError = Object.values(validation.errors)[0]
        return { success: false, error: firstError || 'Client address is invalid' }
      }
      addressFields = buildStructuredAddressDbFields(normalized)
    }

    const compiledAddress = addressFields
      ? addressFields.address
      : data.address
        ? data.address
        : null

    const geocodeFields = compiledAddress
      ? await geocodeClientAddressFields({
          address: compiledAddress,
          address_street: addressFields?.address_street ?? null,
          address_unit: addressFields?.address_unit ?? null,
          address_city: addressFields?.address_city ?? null,
          address_state: addressFields?.address_state ?? null,
          address_zip: addressFields?.address_zip ?? null,
        })
      : CLEARED_GEOCODE_FIELDS

    const { error } = await supabaseAdmin.from('clients').insert({
      name: data.name,
      contact_name: data.contact_name || null,
      email: data.email || null,
      phone: data.phone || null,
      address: compiledAddress,
      address_street: addressFields?.address_street ?? null,
      address_unit: addressFields?.address_unit ?? null,
      address_city: addressFields?.address_city ?? null,
      address_state: addressFields?.address_state ?? null,
      address_zip: addressFields?.address_zip ?? null,
      notes: data.notes || null,
      company_id: check.companyId,
      status: 'active',
      ...geocodeFields,
    })

    if (error) throw error

    revalidatePath('/dashboard/clients')
    return { success: true }
  } catch (error: any) {
    console.error('Error creating client:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteCrew(crewId: string) {
  const access = await verifyCrewCompanyAccess(crewId)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  try {
    // 1. Remove all members from this crew (set crew_id to null)
    await supabaseAdmin
      .from('profiles')
      .update({ crew_id: null })
      .eq('crew_id', crewId)

    // 2. Delete the crew
    const { error } = await supabaseAdmin
      .from('crews')
      .delete()
      .eq('id', crewId)

    if (error) throw error

    revalidatePath('/dashboard/crews')
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting crew:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteUserCompletely(userId: string, avatarUrl?: string | null) {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { success: false, error: adminCheck.error }
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // <-- Service Role Key
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  try {
    // 1. Delete profile photo from storage (if exists)
    if (avatarUrl) {
      const path = avatarUrl.split('/user-avatars/')[1]
      if (path) {
        await supabaseAdmin.storage.from('user-avatars').remove([path])
      }
    }

    // 2. Delete from profiles table
    await supabaseAdmin.from('profiles').delete().eq('id', userId)

    // 3. Delete from auth.users (this requires service role)
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) throw error

    return { success: true }
  } catch (error: any) {
    console.error('Delete user error:', error)
    return { success: false, error: error.message }
  }
}

export async function updateClientAction(data: {
  id: string
  name?: string
  email?: string
  phone?: string
  address?: string
  clientAddress?: StructuredAddress
  notes?: string
}) {
  const check = await verifyClientForStaff(data.id)
  if (!check.ok) return { success: false, error: check.error }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    // Only include fields that were actually passed in
    const updateData: any = {}

    if (data.name !== undefined) updateData.name = data.name
    if (data.email !== undefined) updateData.email = data.email || null
    if (data.phone !== undefined) updateData.phone = data.phone || null
    if (data.notes !== undefined) updateData.notes = data.notes || null

    if (data.clientAddress !== undefined) {
      const normalized = normalizeStructuredAddress(data.clientAddress)
      const validation = validateStructuredAddressIfPresent(normalized)
      if (!validation.valid) {
        const firstError = Object.values(validation.errors)[0]
        return { success: false, error: firstError || 'Client address is invalid' }
      }
      Object.assign(updateData, buildStructuredAddressDbFields(normalized))
      Object.assign(updateData, await geocodeClientAddressFields({
        ...buildStructuredAddressDbFields(normalized),
      }))
    } else if (data.address !== undefined) {
      updateData.address = data.address || null
      if (data.address) {
        Object.assign(
          updateData,
          await geocodeClientAddressFields({ address: data.address })
        )
      } else {
        Object.assign(updateData, CLEARED_GEOCODE_FIELDS)
      }
    }

    const { error } = await supabaseAdmin
      .from('clients')
      .update(updateData)
      .eq('id', data.id)

    if (error) throw error

    revalidatePath('/dashboard/clients')
    revalidatePath(`/dashboard/clients/${data.id}`)
    return { success: true }
  } catch (error: any) {
    console.error('Error updating client:', error)
    return { success: false, error: error.message }
  }
}

async function verifyClientForStaff(clientId: string) {
  const check = await verifyCompanyStaff()
  if (!check.ok) return check

  const supabaseAdmin = createSupabaseAdmin()
  const { data: client, error } = await supabaseAdmin
    .from('clients')
    .select('id, status, name')
    .eq('id', clientId)
    .eq('company_id', check.companyId)
    .single()

  if (error || !client) {
    return { ok: false as const, error: 'Client not found' }
  }

  return { ...check, client }
}

async function verifyClientCompanyAccess(clientId: string) {
  const check = await verifyCompanyStaff()
  if (!check.ok) return check

  const owned = await verifyClientOwnership(clientId, check.companyId)
  if (!owned) {
    return { ok: false as const, error: 'Client not found' }
  }

  return check
}

async function verifyCrewCompanyAccess(crewId: string) {
  const check = await verifyCompanyStaff()
  if (!check.ok) return check

  const supabaseAdmin = createSupabaseAdmin()
  const { data: crew, error } = await supabaseAdmin
    .from('crews')
    .select('id, company_id, name, crew_lead_id')
    .eq('id', crewId)
    .single()

  if (error || !crew || crew.company_id !== check.companyId) {
    return { ok: false as const, error: 'Crew not found' }
  }

  return { ...check, crew }
}

export async function archiveClientAction(clientId: string) {
  try {
    const check = await verifyClientForStaff(clientId)
    if (!check.ok) return { success: false as const, error: check.error }

    if (check.client.status === 'archived') {
      return { success: false as const, error: 'Client is already archived' }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('clients')
      .update({ status: 'archived' })
      .eq('id', clientId)

    if (error) throw error

    revalidatePath('/dashboard/clients')
    revalidatePath(`/dashboard/clients/${clientId}`)
    return { success: true as const }
  } catch (error: any) {
    console.error('archiveClientAction error:', error)
    return { success: false as const, error: error.message || 'Failed to archive client' }
  }
}

export async function restoreClientAction(clientId: string) {
  try {
    const check = await verifyClientForStaff(clientId)
    if (!check.ok) return { success: false as const, error: check.error }

    if (check.client.status !== 'archived') {
      return { success: false as const, error: 'Client is not archived' }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('clients')
      .update({ status: 'active' })
      .eq('id', clientId)

    if (error) throw error

    revalidatePath('/dashboard/clients')
    revalidatePath(`/dashboard/clients/${clientId}`)
    return { success: true as const }
  } catch (error: any) {
    console.error('restoreClientAction error:', error)
    return { success: false as const, error: error.message || 'Failed to restore client' }
  }
}

export async function createJobAction(data: {
  clientId: string
  crewId?: string | null
  title: string
  description?: string
  startTime: string
  endTime: string
  companyId: string
  recurrence?: string
  price?: number
}) {
  const clientCheck = await verifyClientCompanyAccess(data.clientId)
  if (!clientCheck.ok) return { success: false, error: clientCheck.error }
  if (clientCheck.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const closedDayError = await assertScheduleOnOpenCompanyDay(
      supabaseAdmin,
      clientCheck.companyId,
      data.startTime
    )
    if (closedDayError) {
      return { success: false, error: closedDayError }
    }

    if (data.crewId) {
      const bufferMinutes = await getCompanyTravelBufferMinutes(supabaseAdmin, clientCheck.companyId)
      const conflict = await checkJobConflict(data.crewId, data.startTime, data.endTime, {
        bufferMinutes,
      })

      if (conflict.hasConflict) {
        const alternatives = await suggestAlternativeCrews(
          clientCheck.companyId,
          data.startTime,
          data.endTime,
          data.crewId,
          { bufferMinutes }
        )

        return {
          success: false,
          error: 'Crew is not available at this time',
          suggestedCrews: alternatives,
        }
      }
    }

    let recurringRuleId = null

    // Create recurring rule if needed
    if (data.recurrence && data.recurrence !== 'none') {
      const { data: newRule } = await supabaseAdmin
        .from('recurring_rules')
        .insert({
          frequency: data.recurrence,
          interval: 1,
        })
        .select()
        .single()

      recurringRuleId = newRule?.id
    }

    // Create Schedule
        const { data: newSchedule, error } = await supabaseAdmin
          .from('schedules')
          .insert({
            client_id: data.clientId,
            crew_id: data.crewId || null,
            recurring_rule_id: recurringRuleId,
            title: data.title,
            description: data.description || null,
            start_time: data.startTime,
            end_time: data.endTime,
            status: 'scheduled',
            price: data.price || 0,
          })
          .select()
          .single()

        if (error) throw error

        if (newSchedule && (data.price || 0) > 0) {
          await seedBillingFromJobPrice(
            supabaseAdmin,
            newSchedule.id,
            data.clientId,
            clientCheck.companyId,
            data.title,
            data.price || 0
          )
          try {
            await syncJobInvoiceDocument(newSchedule.id)
          } catch (invoiceError) {
            console.error('createJobAction invoice sync error:', invoiceError)
          }
        }

        const { queueCompanyZapierEvent } = await import('@/lib/integration-events')
        const [{ data: jobClient }, { data: jobCrew }] = await Promise.all([
          supabaseAdmin.from('clients').select('name').eq('id', data.clientId).single(),
          data.crewId
            ? supabaseAdmin.from('crews').select('name').eq('id', data.crewId).single()
            : Promise.resolve({ data: null }),
        ])

        queueCompanyZapierEvent(supabaseAdmin, {
          companyId: clientCheck.companyId,
          event: 'job_scheduled',
          data: {
            schedule_id: newSchedule.id,
            client_id: data.clientId,
            job_title: newSchedule.title,
            start_time: newSchedule.start_time,
            end_time: newSchedule.end_time,
            crew_id: newSchedule.crew_id,
            crew_name: jobCrew?.name ?? null,
            client_name: jobClient?.name ?? null,
            rescheduled: false,
          },
        })

        revalidatePath(`/dashboard/clients/${data.clientId}`)
        revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${newSchedule.id}`)
        revalidatePath('/dashboard/schedule')

        const { queueGoogleCalendarSync } = await import('@/lib/google-calendar-sync')
        await queueGoogleCalendarSync(supabaseAdmin, newSchedule.id)

        return { success: true, schedule: newSchedule }
  } catch (error: any) {
    console.error('Error creating schedule:', error)
    return {
      success: false,
      error: error.message || 'Failed to create job',
    }
  }
}

export async function syncScheduleStatusesAction(clientId: string) {
  const access = await verifyClientCompanyAccess(clientId)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { syncClientScheduleStatuses } = await import('@/lib/schedule-status-sync')
    const { activated, archived } = await syncClientScheduleStatuses(supabaseAdmin, clientId)

    revalidatePath(`/dashboard/clients/${clientId}`)

    return {
      success: true,
      activated,
      archived,
      message: `Activated: ${activated}, Archived: ${archived}`,
    }
  } catch (error: any) {
    console.error('syncScheduleStatusesAction error:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// Job CRUD
// ============================================

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

async function getCompanyTravelBufferMinutes(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  companyId: string
) {
  const { data } = await supabaseAdmin
    .from('companies')
    .select('booking_settings')
    .eq('id', companyId)
    .single()

  return normalizeBookingSettings(data?.booking_settings).travel_buffer_minutes
}

async function getCompanyBusinessHoursForScheduling(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  companyId: string
) {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('timezone, business_hours_start, business_hours_end, business_open_weekdays')
    .eq('id', companyId)
    .single()

  if (error || !data) {
    throw new Error('Company not found')
  }

  return {
    timezone: data.timezone || 'America/Chicago',
    businessHours: normalizeBusinessHours(
      data.business_hours_start,
      data.business_hours_end,
      data.business_open_weekdays
    ),
  }
}

async function assertScheduleOnOpenCompanyDay(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  companyId: string,
  startIso: string
): Promise<string | null> {
  const { timezone, businessHours } = await getCompanyBusinessHoursForScheduling(
    supabaseAdmin,
    companyId
  )

  if (!isOpenAtInstant(startIso, timezone, businessHours)) {
    const { getCompanyDateString } = await import('@/lib/timezone')
    return getClosedDayError(getCompanyDateString(timezone, new Date(startIso)), timezone)
  }

  return null
}

export async function getJobAction(jobId: string, clientId: string) {
  const access = await verifyScheduleCompanyAccess(jobId, clientId)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { data, error } = await supabaseAdmin
      .from('schedules')
      .select(`
        *,
        crew:crews!crew_id (id, name),
        client:clients!client_id (
          id,
          name,
          address,
          address_street,
          address_unit,
          address_city,
          address_state,
          address_zip
        )
      `)
      .eq('id', jobId)
      .eq('client_id', clientId)
      .single()

    if (error) throw error
    if (!data) return { success: false, error: 'Job not found' }

    return { success: true, job: data }
  } catch (error: any) {
    console.error('getJobAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function updateJobAction(data: {
  jobId: string
  clientId: string
  companyId: string
  title?: string
  description?: string
  startTime?: string
  endTime?: string
  crewId?: string | null
  price?: number
}) {
  const access = await verifyScheduleCompanyAccess(data.jobId, data.clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const existing = access.schedule

  try {
    if (existing.status === 'archived' || existing.status === 'cancelled') {
      return { success: false, error: 'Cannot edit archived or cancelled jobs' }
    }

    const startTime = data.startTime ?? existing.start_time
    const endTime = data.endTime ?? existing.end_time
    const crewId = data.crewId !== undefined ? data.crewId : existing.crew_id

    if (data.startTime !== undefined) {
      const closedDayError = await assertScheduleOnOpenCompanyDay(
        supabaseAdmin,
        access.companyId,
        startTime
      )
      if (closedDayError) {
        return { success: false, error: closedDayError }
      }
    }

    if (crewId) {
      const bufferMinutes = await getCompanyTravelBufferMinutes(supabaseAdmin, access.companyId)
      const conflict = await checkJobConflict(crewId, startTime, endTime, {
        bufferMinutes,
        excludeScheduleId: data.jobId,
      })

      if (conflict.hasConflict) {
        const alternatives = await suggestAlternativeCrews(
          access.companyId,
          startTime,
          endTime,
          crewId,
          { bufferMinutes, excludeScheduleId: data.jobId }
        )

        return {
          success: false,
          error: 'Crew is not available at this time',
          suggestedCrews: alternatives,
        }
      }
    }

    const updateData: Record<string, unknown> = {}
    if (data.title !== undefined) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description || null
    if (data.startTime !== undefined) updateData.start_time = data.startTime
    if (data.endTime !== undefined) updateData.end_time = data.endTime
    if (data.crewId !== undefined) updateData.crew_id = data.crewId || null
    if (data.price !== undefined) updateData.price = data.price

    const { data: updated, error } = await supabaseAdmin
      .from('schedules')
      .update(updateData)
      .eq('id', data.jobId)
      .select(`
        *,
        crew:crews!crew_id (id, name)
      `)
      .single()

    if (error) throw error

    if (data.price !== undefined && data.price > 0) {
      const { data: existingLines } = await supabaseAdmin
        .from('billing_line_items')
        .select('id')
        .eq('schedule_id', data.jobId)
        .limit(1)

      if (!existingLines || existingLines.length === 0) {
        await seedBillingFromJobPrice(
          supabaseAdmin,
          data.jobId,
          data.clientId,
          access.companyId,
          (data.title ?? existing.title) as string,
          data.price
        )
        try {
          await syncJobInvoiceDocument(data.jobId)
        } catch (invoiceError) {
          console.error('updateJobAction invoice sync error:', invoiceError)
        }
      }
    }

    const scheduleChanged =
      (data.startTime !== undefined && data.startTime !== existing.start_time) ||
      (data.endTime !== undefined && data.endTime !== existing.end_time) ||
      (data.crewId !== undefined && data.crewId !== existing.crew_id)

    if (scheduleChanged) {
      const { queueCompanyZapierEvent } = await import('@/lib/integration-events')
      const crew = Array.isArray(updated.crew) ? updated.crew[0] : updated.crew
      const { data: jobClient } = await supabaseAdmin
        .from('clients')
        .select('name')
        .eq('id', data.clientId)
        .single()

      queueCompanyZapierEvent(supabaseAdmin, {
        companyId: access.companyId,
        event: 'job_scheduled',
        data: {
          schedule_id: updated.id,
          client_id: data.clientId,
          job_title: updated.title,
          start_time: updated.start_time,
          end_time: updated.end_time,
          crew_id: updated.crew_id,
          crew_name: crew?.name ?? null,
          client_name: jobClient?.name ?? null,
          rescheduled: true,
        },
      })
    }

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.jobId}`)
    revalidatePath('/dashboard/schedule')

    const { queueGoogleCalendarSync } = await import('@/lib/google-calendar-sync')
    await queueGoogleCalendarSync(supabaseAdmin, data.jobId)

    return { success: true, job: updated }
  } catch (error: any) {
    console.error('updateJobAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function cancelJobAction(jobId: string, clientId: string) {
  const access = await verifyScheduleCompanyAccess(jobId, clientId)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()
  const existing = access.schedule

  try {
    if (existing.status !== 'scheduled') {
      return { success: false, error: 'Only scheduled jobs can be cancelled' }
    }

    const { error } = await supabaseAdmin
      .from('schedules')
      .update({ status: 'cancelled' })
      .eq('id', jobId)

    if (error) {
      if (error.code === '23514' && error.message?.includes('schedules_status_check')) {
        return {
          success: false,
          error:
            'Job cancellation is not enabled in the database yet. Run supabase/schedules-cancelled-status.sql in the Supabase SQL editor.',
        }
      }
      throw error
    }

    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath(`/dashboard/clients/${clientId}/jobs/${jobId}`)
    revalidatePath('/dashboard/schedule')

    const { queueGoogleCalendarSync } = await import('@/lib/google-calendar-sync')
    await queueGoogleCalendarSync(supabaseAdmin, jobId)

    return { success: true }
  } catch (error: any) {
    console.error('cancelJobAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function archiveJobAction(jobId: string, clientId: string) {
  const access = await verifyScheduleCompanyAccess(jobId, clientId)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()
  const existing = access.schedule

  try {
    if (existing.status !== 'in_progress') {
      return { success: false, error: 'Only in-progress jobs can be archived early' }
    }

    const { error } = await supabaseAdmin
      .from('schedules')
      .update({ status: 'archived' })
      .eq('id', jobId)

    if (error) throw error

    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath(`/dashboard/clients/${clientId}/jobs/${jobId}`)
    revalidatePath('/dashboard/schedule')

    const { queueGoogleCalendarSync } = await import('@/lib/google-calendar-sync')
    await queueGoogleCalendarSync(supabaseAdmin, jobId)

    return { success: true }
  } catch (error: any) {
    console.error('archiveJobAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteJobAction(jobId: string, clientId: string) {
  const access = await verifyScheduleCompanyAccess(jobId, clientId)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()
  const existing = access.schedule

  try {
    if (existing.status !== 'scheduled' && existing.status !== 'cancelled') {
      return { success: false, error: 'Only scheduled or cancelled jobs can be deleted' }
    }

    const { queueGoogleCalendarRemoval } = await import('@/lib/google-calendar-sync')
    await queueGoogleCalendarRemoval(supabaseAdmin, jobId)

    const { error } = await supabaseAdmin
      .from('schedules')
      .delete()
      .eq('id', jobId)

    if (error) throw error

    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath('/dashboard/schedule')

    return { success: true }
  } catch (error: any) {
    console.error('deleteJobAction error:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// Billing
// ============================================

async function verifyScheduleOwnership(scheduleId: string, clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('schedules')
    .select('id, client_id, title, start_time, end_time, status, price, crew_id, recurring_rule_id')
    .eq('id', scheduleId)
    .eq('client_id', clientId)
    .single()

  if (error || !data) return null
  return data
}

async function fetchInvoiceDocumentMeta(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  scheduleId: string
) {
  const { data: invoiceDoc } = await supabaseAdmin
    .from('client_documents')
    .select('id, name, created_at')
    .eq('schedule_id', scheduleId)
    .eq('source', 'invoice')
    .maybeSingle()

  if (invoiceDoc) return invoiceDoc

  const { data: legacyDoc } = await supabaseAdmin
    .from('client_documents')
    .select('id, name, created_at')
    .eq('schedule_id', scheduleId)
    .eq('source', 'upload')
    .eq('category', SYSTEM_DOCUMENT_CATEGORY_INVOICES)
    .maybeSingle()

  return legacyDoc
}

async function refreshJobInvoice(scheduleId: string) {
  return syncJobInvoiceDocument(scheduleId)
}

async function getCompanyIdForClient(clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const { data } = await supabaseAdmin
    .from('clients')
    .select('company_id')
    .eq('id', clientId)
    .single()
  return data?.company_id ?? null
}

async function verifyScheduleCompanyAccess(scheduleId: string, clientId: string) {
  const check = await verifyCompanyStaff()
  if (!check.ok) return check

  const companyId = await getCompanyIdForClient(clientId)
  if (!companyId || companyId !== check.companyId) {
    return { ok: false as const, error: 'Job not found' }
  }

  const schedule = await verifyScheduleOwnership(scheduleId, clientId)
  if (!schedule) {
    return { ok: false as const, error: 'Job not found' }
  }

  // Crew ACL: team members may open jobs on their crew or where they are helpers (P4)
  if (check.session.profile.role === 'team_member') {
    const supabaseAdmin = createSupabaseAdmin()
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('crew_id')
      .eq('id', check.userId)
      .maybeSingle()

    const { isUserHelperOnSchedule } = await import('@/app/job-helpers-actions')
    const isHelper = await isUserHelperOnSchedule(scheduleId, check.userId)
    const { canTeamMemberAccessCrewJob } = await import('@/lib/field-job-access')
    if (
      !canTeamMemberAccessCrewJob(
        schedule.crew_id,
        profile?.crew_id ?? null,
        isHelper
      )
    ) {
      return { ok: false as const, error: 'Job not found' }
    }
  }

  return { ...check, schedule, companyId }
}

export async function getJobPhotosAction(
  scheduleId: string,
  clientId: string
): Promise<
  { success: true; photos: JobPhotoWithUrl[] } | { success: false; error: string }
> {
  try {
    const access = await verifyScheduleCompanyAccess(scheduleId, clientId)
    if (!access.ok) return { success: false, error: access.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: photos, error } = await supabaseAdmin
      .from('job_photos')
      .select('*')
      .eq('schedule_id', scheduleId)
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42P01') {
        return { success: true, photos: [] }
      }
      throw error
    }

    const withUrls: JobPhotoWithUrl[] = []
    for (const photo of photos || []) {
      const { data: signed, error: signedError } = await supabaseAdmin.storage
        .from(JOB_PHOTO_BUCKET)
        .createSignedUrl(photo.storage_path, 60 * 60)

      if (signedError || !signed?.signedUrl) continue

      withUrls.push({ ...photo, url: signed.signedUrl })
    }

    return { success: true, photos: withUrls }
  } catch (error: any) {
    console.error('getJobPhotosAction error:', error)
    return { success: false, error: error.message || 'Failed to load photos' }
  }
}

export async function uploadJobPhotoAction(
  scheduleId: string,
  clientId: string,
  formData: FormData
): Promise<{ success: true; photo: JobPhotoWithUrl } | { success: false; error: string }> {
  try {
    const access = await verifyScheduleCompanyAccess(scheduleId, clientId)
    if (!access.ok) return { success: false, error: access.error }

    const file = formData.get('file') as File | null
    const caption = String(formData.get('caption') || '').trim() || null
    const categoryRaw = String(formData.get('category') || '').trim() || null

    if (!file || typeof file.size !== 'number' || file.size === 0) {
      return { success: false, error: 'No image file provided' }
    }

    if (!JOB_PHOTO_ACCEPTED_TYPES.includes(file.type as (typeof JOB_PHOTO_ACCEPTED_TYPES)[number])) {
      return { success: false, error: 'Use a JPG, PNG, or WebP image' }
    }

    if (file.size > JOB_PHOTO_MAX_BYTES) {
      return { success: false, error: 'Image must be 10 MB or smaller' }
    }

    const supabaseAdmin = createSupabaseAdmin()

    const { data: companyRow } = await supabaseAdmin
      .from('companies')
      .select('job_photo_categories')
      .eq('id', access.companyId)
      .single()

    const availableCategories = normalizeJobPhotoCategories(
      companyRow?.job_photo_categories
    )
    const category =
      availableCategories.length > 0
        ? normalizePhotoCategory(categoryRaw, availableCategories)
        : categoryRaw || DEFAULT_JOB_PHOTO_CATEGORY

    if (availableCategories.length > 0 && !category) {
      return { success: false, error: 'Select a photo category before uploading' }
    }

    const { getCompanySubscriptionAccessForCompany } = await import(
      '@/lib/platform-trial-server'
    )
    const subscription = await getCompanySubscriptionAccessForCompany(access.companyId)
    const plan = subscription?.plan ?? 'trial'
    const storageLimit = getPhotoStorageLimitForPlan(plan)
    const { data: usageRow } = await supabaseAdmin
      .from('job_photos')
      .select('file_size')
      .eq('company_id', access.companyId)

    const usedBytes = (usageRow || []).reduce(
      (sum, row) => sum + Number(row.file_size || 0),
      0
    )

    if (wouldExceedPhotoStorage(usedBytes, storageLimit, file.size)) {
      return {
        success: false,
        error: getPhotoStorageFullMessage(plan),
      }
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const storagePath = `${access.companyId}/${scheduleId}/${Date.now()}.${fileExt}`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabaseAdmin.storage
      .from(JOB_PHOTO_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      return { success: false, error: uploadError.message }
    }

    const { data: photo, error: insertError } = await supabaseAdmin
      .from('job_photos')
      .insert({
        schedule_id: scheduleId,
        client_id: clientId,
        company_id: access.companyId,
        storage_path: storagePath,
        file_name: file.name,
        content_type: file.type,
        file_size: file.size,
        caption,
        category,
        uploaded_by: access.userId,
      })
      .select('*')
      .single()

    if (insertError) {
      await supabaseAdmin.storage.from(JOB_PHOTO_BUCKET).remove([storagePath])
      if (insertError.code === '42P01') {
        return {
          success: false,
          error: 'Job photos are not enabled yet. Run supabase/job-photos-schema.sql and create the job-photos storage bucket.',
        }
      }
      throw insertError
    }

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(JOB_PHOTO_BUCKET)
      .createSignedUrl(storagePath, 60 * 60)

    if (signedError || !signed?.signedUrl) {
      return { success: false, error: 'Photo uploaded but could not be displayed' }
    }

    revalidatePath(`/dashboard/clients/${clientId}/jobs/${scheduleId}`)
    revalidatePath('/portal/photos')
    revalidatePath(`/portal/jobs/${scheduleId}`)

    return { success: true, photo: { ...photo, url: signed.signedUrl } }
  } catch (error: any) {
    console.error('uploadJobPhotoAction error:', error)
    return { success: false, error: error.message || 'Failed to upload photo' }
  }
}

export async function getJobPhotoCategoriesAction(): Promise<
  { success: true; categories: JobPhotoCategory[] } | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: company, error } = await supabaseAdmin
      .from('companies')
      .select('job_photo_categories')
      .eq('id', check.companyId)
      .single()

    if (error) {
      if (error.code === '42703') {
        return { success: true, categories: normalizeJobPhotoCategories(null) }
      }
      throw error
    }

    return {
      success: true,
      categories: normalizeJobPhotoCategories(company?.job_photo_categories),
    }
  } catch (error: any) {
    console.error('getJobPhotoCategoriesAction error:', error)
    return { success: false, error: error.message || 'Failed to load photo categories' }
  }
}

export async function updateJobPhotoCategoriesAction(
  categories: JobPhotoCategory[]
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }

    const normalized = categories
      .map((category) => category.trim())
      .filter(Boolean)

    const validation = validateJobPhotoCategories(normalized)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('companies')
      .update({ job_photo_categories: normalized })
      .eq('id', check.companyId)

    if (error) {
      if (error.code === '42703') {
        return {
          success: false,
          error: 'Photo categories are not enabled yet. Run supabase/job-photo-categories.sql.',
        }
      }
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/settings')
    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error: any) {
    console.error('updateJobPhotoCategoriesAction error:', error)
    return { success: false, error: error.message || 'Failed to save photo categories' }
  }
}

export async function deleteJobPhotoAction(
  photoId: string,
  scheduleId: string,
  clientId: string
) {
  try {
    const access = await verifyScheduleCompanyAccess(scheduleId, clientId)
    if (!access.ok) return { success: false, error: access.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: photo, error: photoError } = await supabaseAdmin
      .from('job_photos')
      .select('id, storage_path, company_id')
      .eq('id', photoId)
      .eq('schedule_id', scheduleId)
      .single()

    if (photoError || !photo) {
      return { success: false, error: 'Photo not found' }
    }

    if (photo.company_id !== access.companyId) {
      return { success: false, error: 'Photo not found' }
    }

    const { error: deleteRowError } = await supabaseAdmin
      .from('job_photos')
      .delete()
      .eq('id', photoId)

    if (deleteRowError) throw deleteRowError

    await supabaseAdmin.storage.from(JOB_PHOTO_BUCKET).remove([photo.storage_path])

    revalidatePath(`/dashboard/clients/${clientId}/jobs/${scheduleId}`)
    revalidatePath('/portal/photos')
    return { success: true }
  } catch (error: any) {
    console.error('deleteJobPhotoAction error:', error)
    return { success: false, error: error.message || 'Failed to delete photo' }
  }
}

async function attachSignedUrlsToJobPhotos(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  photos: JobPhoto[]
): Promise<JobPhotoWithUrl[]> {
  const withUrls: JobPhotoWithUrl[] = []

  for (const photo of photos) {
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(JOB_PHOTO_BUCKET)
      .createSignedUrl(photo.storage_path, 60 * 60)

    if (signedError || !signed?.signedUrl) continue
    withUrls.push({ ...photo, url: signed.signedUrl })
  }

  return withUrls
}

async function getCompanyPhotoStorageUsage(companyId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('job_photos')
    .select('file_size')
    .eq('company_id', companyId)

  if (error) {
    if (error.code === '42P01') return 0
    throw error
  }

  return (data || []).reduce((sum, row) => sum + Number(row.file_size || 0), 0)
}

export async function getCompanyPhotoStorageAction(): Promise<
  | {
      success: true
      usedBytes: number
      limitBytes: number
      plan: string
      usedLabel: string
      limitLabel: string
    }
  | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }

    const { getCompanySubscriptionAccessForCompany } = await import(
      '@/lib/platform-trial-server'
    )
    const subscription = await getCompanySubscriptionAccessForCompany(check.companyId)
    const plan = subscription?.plan ?? 'trial'
    const limitBytes = getPhotoStorageLimitForPlan(plan)
    const usedBytes = await getCompanyPhotoStorageUsage(check.companyId)

    return {
      success: true,
      usedBytes,
      limitBytes,
      plan,
      usedLabel: formatPhotoStorageBytes(usedBytes),
      limitLabel: formatPhotoStorageBytes(limitBytes),
    }
  } catch (error: any) {
    console.error('getCompanyPhotoStorageAction error:', error)
    return { success: false, error: error.message || 'Failed to load photo storage' }
  }
}

export async function getClientPhotosAction(
  clientId: string,
  options?: { scheduleId?: string | null }
): Promise<
  | {
      success: true
      photos: JobPhotoWithUrl[]
      categories: JobPhotoCategory[]
      storage: {
        usedBytes: number
        limitBytes: number
        usedLabel: string
        limitLabel: string
        plan: string
      }
    }
  | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }

    const owned = await verifyClientOwnership(clientId, check.companyId)
    if (!owned) return { success: false, error: 'Client not found' }

    const supabaseAdmin = createSupabaseAdmin()
    let query = supabaseAdmin
      .from('job_photos')
      .select('*')
      .eq('client_id', clientId)
      .eq('company_id', check.companyId)
      .order('created_at', { ascending: false })

    if (options?.scheduleId) {
      query = query.eq('schedule_id', options.scheduleId)
    }

    const [{ data: photos, error }, { data: company }, storageResult] = await Promise.all([
      query,
      supabaseAdmin
        .from('companies')
        .select('job_photo_categories')
        .eq('id', check.companyId)
        .single(),
      getCompanyPhotoStorageAction(),
    ])

    if (error) {
      if (error.code === '42P01') {
        return {
          success: true,
          photos: [],
          categories: normalizeJobPhotoCategories(null),
          storage: storageResult.success
            ? {
                usedBytes: storageResult.usedBytes,
                limitBytes: storageResult.limitBytes,
                usedLabel: storageResult.usedLabel,
                limitLabel: storageResult.limitLabel,
                plan: storageResult.plan,
              }
            : {
                usedBytes: 0,
                limitBytes: getPhotoStorageLimitForPlan('trial'),
                usedLabel: '0 B',
                limitLabel: formatPhotoStorageBytes(getPhotoStorageLimitForPlan('trial')),
                plan: 'trial',
              },
        }
      }
      throw error
    }

    const withUrls = await attachSignedUrlsToJobPhotos(supabaseAdmin, photos || [])

    return {
      success: true,
      photos: withUrls,
      categories: normalizeJobPhotoCategories(company?.job_photo_categories),
      storage: storageResult.success
        ? {
            usedBytes: storageResult.usedBytes,
            limitBytes: storageResult.limitBytes,
            usedLabel: storageResult.usedLabel,
            limitLabel: storageResult.limitLabel,
            plan: storageResult.plan,
          }
        : {
            usedBytes: 0,
            limitBytes: getPhotoStorageLimitForPlan('trial'),
            usedLabel: '0 B',
            limitLabel: formatPhotoStorageBytes(getPhotoStorageLimitForPlan('trial')),
            plan: 'trial',
          },
    }
  } catch (error: any) {
    console.error('getClientPhotosAction error:', error)
    return { success: false, error: error.message || 'Failed to load photos' }
  }
}

export async function getClientJobsForPhotosAction(clientId: string) {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false as const, error: check.error }

    const owned = await verifyClientOwnership(clientId, check.companyId)
    if (!owned) return { success: false as const, error: 'Client not found' }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: jobs, error } = await supabaseAdmin
      .from('schedules')
      .select('id, title, start_time, status')
      .eq('client_id', clientId)
      .order('start_time', { ascending: false })

    if (error) throw error
    return { success: true as const, jobs: jobs || [] }
  } catch (error: any) {
    console.error('getClientJobsForPhotosAction error:', error)
    return { success: false as const, error: error.message || 'Failed to load jobs' }
  }
}

function sanitizeUploadedFileName(name: string) {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_')
  return base.slice(0, 120) || 'file'
}

export async function getDocumentCategoriesAction(): Promise<
  { success: true; categories: DocumentCategory[] } | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: company, error } = await supabaseAdmin
      .from('companies')
      .select('document_categories')
      .eq('id', check.companyId)
      .single()

    if (error) {
      if (error.code === '42703') {
        return { success: true, categories: normalizeDocumentCategories(null) }
      }
      throw error
    }

    return {
      success: true,
      categories: normalizeDocumentCategories(company?.document_categories),
    }
  } catch (error: any) {
    console.error('getDocumentCategoriesAction error:', error)
    return { success: false, error: error.message || 'Failed to load document categories' }
  }
}

export async function updateDocumentCategoriesAction(
  categories: DocumentCategory[]
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }

    const normalized = categories.map((category) => category.trim()).filter(Boolean)
    const validation = validateDocumentCategories(normalized)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('companies')
      .update({ document_categories: normalized })
      .eq('id', check.companyId)

    if (error) {
      if (error.code === '42703') {
        return {
          success: false,
          error: 'Document categories are not enabled yet. Run supabase/document-uploads-schema.sql.',
        }
      }
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/settings')
    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error: any) {
    console.error('updateDocumentCategoriesAction error:', error)
    return { success: false, error: error.message || 'Failed to save document categories' }
  }
}

export async function getDocumentTemplatesAction(): Promise<
  | { success: true; templates: import('@/lib/document-template').CompanyDocumentTemplates }
  | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    const { loadCompanyDocumentTemplates } = await import('@/lib/document-template-storage')
    const supabaseAdmin = createSupabaseAdmin()
    const templates = await loadCompanyDocumentTemplates(supabaseAdmin, check.companyId)
    return { success: true, templates }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load document templates' }
  }
}

export async function updateDocumentTemplateAction(
  kind: import('@/lib/document-template').InvoiceEstimateDocumentKind,
  template: import('@/lib/document-template').DocumentTemplate
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    if (check.session.profile.role !== 'company_admin') {
      return { success: false, error: 'Only company admins can edit document templates' }
    }

    const {
      buildDocumentTemplatesPayload,
      buildLegacyInvoiceTemplatePayload,
      loadCompanyDocumentTemplates,
    } = await import('@/lib/document-template-storage')
    const { normalizeDocumentTemplate } = await import('@/lib/document-template')

    const supabaseAdmin = createSupabaseAdmin()
    const current = await loadCompanyDocumentTemplates(supabaseAdmin, check.companyId)
    const normalized = normalizeDocumentTemplate(template, kind)
    const nextTemplates = buildDocumentTemplatesPayload(current, kind, normalized)

    const updatePayload: Record<string, unknown> = {
      document_templates: nextTemplates,
    }

    if (kind === 'invoice') {
      updatePayload.invoice_template = buildLegacyInvoiceTemplatePayload(normalized)
    }

    const { error } = await supabaseAdmin
      .from('companies')
      .update(updatePayload)
      .eq('id', check.companyId)

    if (error?.code === '42703') {
      return {
        success: false,
        error:
          'Document templates are not enabled yet. Add document_templates JSONB column to companies.',
      }
    }
    if (error) return { success: false, error: error.message }

    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to save document template' }
  }
}

export async function resetDocumentTemplateAction(
  kind: import('@/lib/document-template').InvoiceEstimateDocumentKind
): Promise<
  | { success: true; template: import('@/lib/document-template').DocumentTemplate }
  | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    if (check.session.profile.role !== 'company_admin') {
      return { success: false, error: 'Only company admins can edit document templates' }
    }

    const { resetToDefaultTemplate } = await import('@/lib/document-template-presets')
    const template = resetToDefaultTemplate(kind)
    const result = await updateDocumentTemplateAction(kind, template)
    if (!result.success) return result

    return { success: true, template }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to reset document template' }
  }
}

export async function copyInvoiceLayoutToEstimateAction(): Promise<
  | { success: true; template: import('@/lib/document-template').DocumentTemplate }
  | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    if (check.session.profile.role !== 'company_admin') {
      return { success: false, error: 'Only company admins can edit document templates' }
    }

    const { applyInvoiceLayoutToEstimate } = await import('@/lib/document-template-presets')
    const { loadCompanyDocumentTemplates } = await import('@/lib/document-template-storage')
    const supabaseAdmin = createSupabaseAdmin()
    const current = await loadCompanyDocumentTemplates(supabaseAdmin, check.companyId)
    const template = applyInvoiceLayoutToEstimate(current.invoice, current.estimate)
    const result = await updateDocumentTemplateAction('estimate', template)
    if (!result.success) return result

    return { success: true, template }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to copy invoice layout to estimate',
    }
  }
}

export async function getInvoiceTemplateAction(): Promise<
  | { success: true; template: import('@/lib/invoice-template').InvoiceTemplate }
  | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    const { documentTemplateToInvoiceTemplate } = await import('@/lib/document-template')
    const { loadCompanyDocumentTemplates } = await import('@/lib/document-template-storage')
    const supabaseAdmin = createSupabaseAdmin()
    const templates = await loadCompanyDocumentTemplates(supabaseAdmin, check.companyId)
    return {
      success: true,
      template: documentTemplateToInvoiceTemplate(templates.invoice),
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load invoice template' }
  }
}

export async function updateInvoiceTemplateAction(
  template: import('@/lib/invoice-template').InvoiceTemplate
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    if (check.session.profile.role !== 'company_admin') {
      return { success: false, error: 'Only company admins can edit invoice templates' }
    }
    const { normalizeInvoiceTemplate } = await import('@/lib/invoice-template')
    const { migrateInvoiceTemplateToDocumentTemplate } = await import('@/lib/document-template')
    const normalized = normalizeInvoiceTemplate(template)
    const documentTemplate = migrateInvoiceTemplateToDocumentTemplate(normalized)
    const result = await updateDocumentTemplateAction('invoice', documentTemplate)
    if (!result.success) return result
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to save invoice template' }
  }
}

export async function getCompanyIntegrationsAction(): Promise<
  | { success: true; integrations: import('@/lib/integrations').IntegrationRecord[] }
  | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    if (check.session.profile.role !== 'company_admin') {
      return { success: false, error: 'Only company admins can manage integrations' }
    }

    const { assertCompanyPlatformFeature } = await import(
      '@/lib/platform-entitlements-server'
    )
    const featureGate = await assertCompanyPlatformFeature(check.companyId, 'integrations')
    if (!featureGate.ok) return { success: false, error: featureGate.error }

    const { INTEGRATION_PROVIDERS, normalizeIntegrationRecord } = await import('@/lib/integrations')
    const { sanitizeIntegrationConfigForClient } = await import('@/lib/quickbooks-oauth')
    const providers = Object.keys(INTEGRATION_PROVIDERS) as import('@/lib/integrations').IntegrationProvider[]
    const supabaseAdmin = createSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('company_integrations')
      .select('provider, status, config, connected_at')
      .eq('company_id', check.companyId)

    if (error?.code === '42P01') {
      return {
        success: true,
        integrations: providers.map((provider) => normalizeIntegrationRecord(null, provider)),
      }
    }
    if (error) return { success: false, error: error.message }

    const byProvider = new Map((data || []).map((row) => [row.provider, row]))
    const integrations = providers.map((provider) => {
      const record = normalizeIntegrationRecord(byProvider.get(provider), provider)
      return {
        ...record,
        config: sanitizeIntegrationConfigForClient(provider, record.config),
      }
    })

    return { success: true, integrations }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load integrations' }
  }
}

export async function saveZapierIntegrationAction(webhookUrl: string): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    if (check.session.profile.role !== 'company_admin') {
      return { success: false, error: 'Only company admins can manage integrations' }
    }

    const { assertCompanyPlatformFeature } = await import(
      '@/lib/platform-entitlements-server'
    )
    const featureGate = await assertCompanyPlatformFeature(check.companyId, 'integrations')
    if (!featureGate.ok) return { success: false, error: featureGate.error }

    const { isValidZapierWebhookUrl } = await import('@/lib/integrations')
    const trimmed = webhookUrl.trim()
    if (!trimmed) {
      return { success: false, error: 'Webhook URL is required' }
    }
    if (!isValidZapierWebhookUrl(trimmed)) {
      return { success: false, error: 'Enter a valid HTTPS webhook URL' }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const now = new Date().toISOString()
    const { error } = await supabaseAdmin.from('company_integrations').upsert(
      {
        company_id: check.companyId,
        provider: 'zapier',
        status: 'connected',
        config: { webhook_url: trimmed },
        connected_at: now,
        updated_at: now,
      },
      { onConflict: 'company_id,provider' }
    )

    if (error?.code === '42P01') {
      return {
        success: false,
        error: 'Integrations are not enabled yet. Run supabase/integrations-schema.sql.',
      }
    }
    if (error) return { success: false, error: error.message }

    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to save Zapier integration' }
  }
}

export async function testZapierIntegrationAction(
  event: import('@/lib/integrations').ZapierEventType = 'invoice_sent'
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    if (check.session.profile.role !== 'company_admin') {
      return { success: false, error: 'Only company admins can manage integrations' }
    }

    const { assertCompanyPlatformFeature } = await import(
      '@/lib/platform-entitlements-server'
    )
    const featureGate = await assertCompanyPlatformFeature(check.companyId, 'integrations')
    if (!featureGate.ok) return { success: false, error: featureGate.error }

    const { getZapierTestPayload, ZAPIER_EVENT_TYPES } = await import('@/lib/integrations')
    if (!ZAPIER_EVENT_TYPES.includes(event)) {
      return { success: false, error: 'Invalid Zapier event type' }
    }

    const { dispatchCompanyZapierEvent } = await import('@/lib/integration-events')
    const supabaseAdmin = createSupabaseAdmin()
    const result = await dispatchCompanyZapierEvent(supabaseAdmin, {
      companyId: check.companyId,
      event,
      data: getZapierTestPayload(event),
    })

    if (!result.delivered) {
      return {
        success: false,
        error:
          result.reason === 'not_connected'
            ? 'Save a Zapier webhook URL first'
            : 'Webhook delivery failed — check the URL',
      }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Test failed' }
  }
}

export async function listGoogleCalendarsAction(): Promise<
  | {
      success: true
      calendars: import('@/lib/google-calendar-oauth').GoogleCalendarListEntry[]
    }
  | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    if (check.session.profile.role !== 'company_admin') {
      return { success: false, error: 'Only company admins can manage integrations' }
    }

    const { assertCompanyPlatformFeature } = await import(
      '@/lib/platform-entitlements-server'
    )
    const featureGate = await assertCompanyPlatformFeature(check.companyId, 'integrations')
    if (!featureGate.ok) return { success: false, error: featureGate.error }

    const { listGoogleCalendarsForCompany } = await import('@/lib/google-calendar-sync')
    const supabaseAdmin = createSupabaseAdmin()
    const calendars = await listGoogleCalendarsForCompany(supabaseAdmin, check.companyId)
    return { success: true, calendars }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load Google calendars' }
  }
}

export async function saveGoogleCalendarSettingsAction(input: {
  syncEnabled: boolean
  calendarId: string | null
  calendarSummary?: string | null
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    if (check.session.profile.role !== 'company_admin') {
      return { success: false, error: 'Only company admins can manage integrations' }
    }

    const { assertCompanyPlatformFeature } = await import(
      '@/lib/platform-entitlements-server'
    )
    const featureGate = await assertCompanyPlatformFeature(check.companyId, 'integrations')
    if (!featureGate.ok) return { success: false, error: featureGate.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: integration, error: loadError } = await supabaseAdmin
      .from('company_integrations')
      .select('status, config')
      .eq('company_id', check.companyId)
      .eq('provider', 'google_calendar')
      .maybeSingle()

    if (loadError?.code === '42P01') {
      return {
        success: false,
        error: 'Integrations are not enabled yet. Run supabase/integrations-schema.sql.',
      }
    }
    if (loadError) return { success: false, error: loadError.message }
    if (integration?.status !== 'connected') {
      return { success: false, error: 'Connect Google Calendar first' }
    }

    const { normalizeGoogleCalendarIntegrationConfig } = await import(
      '@/lib/google-calendar-oauth'
    )
    const config = normalizeGoogleCalendarIntegrationConfig(
      (integration.config || {}) as Record<string, unknown>
    )
    if (!config) {
      return { success: false, error: 'Google Calendar tokens are missing. Reconnect.' }
    }

    if (input.syncEnabled && !input.calendarId?.trim()) {
      return { success: false, error: 'Choose a target calendar before enabling sync' }
    }

    const nextConfig = {
      ...config,
      sync_enabled: input.syncEnabled,
      calendar_id: input.syncEnabled ? input.calendarId?.trim() || null : config.calendar_id,
      calendar_summary: input.calendarSummary?.trim() || null,
    }

    const { error } = await supabaseAdmin
      .from('company_integrations')
      .update({
        config: nextConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', check.companyId)
      .eq('provider', 'google_calendar')

    if (error) return { success: false, error: error.message }

    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to save Google Calendar settings' }
  }
}

export async function getClientJobsForDocumentsAction(clientId: string) {
  try {
    const access = await verifyClientCompanyAccess(clientId)
    if (!access.ok) return { success: false as const, error: access.error }
    const supabaseAdmin = createSupabaseAdmin()
    const { data: jobs, error } = await supabaseAdmin
      .from('schedules')
      .select('id, title, start_time, status')
      .eq('client_id', clientId)
      .order('start_time', { ascending: false })
    if (error) throw error
    return { success: true as const, jobs: jobs || [] }
  } catch (error: any) {
    return { success: false as const, error: error.message || 'Failed to load jobs' }
  }
}

export async function getUploadedDocumentsAction(
  clientId: string,
  scheduleId?: string | null
): Promise<
  { success: true; documents: UploadedDocument[] } | { success: false; error: string }
> {
  try {
    const access = await verifyClientCompanyAccess(clientId)
    if (!access.ok) return { success: false, error: access.error }

    if (scheduleId) {
      const scheduleAccess = await verifyScheduleCompanyAccess(scheduleId, clientId)
      if (!scheduleAccess.ok) return { success: false, error: scheduleAccess.error }
    }

    const supabaseAdmin = createSupabaseAdmin()
    let query = supabaseAdmin
      .from('client_documents')
      .select('*, contract:contracts!contract_id (status)')
      .eq('client_id', clientId)
      .eq('company_id', access.companyId)
      .in('source', ['upload', 'estimate', 'invoice', 'contract'])
      .order('created_at', { ascending: false })

    if (scheduleId) {
      query = query.eq('schedule_id', scheduleId)
    }

    const { data: documents, error } = await query

    if (error) {
      if (error.code === '42703') {
        return { success: true, documents: [] }
      }
      throw error
    }

    return {
      success: true,
      documents: normalizeUploadedDocumentRows((documents || []) as Parameters<typeof normalizeUploadedDocumentRows>[0]),
    }
  } catch (error: any) {
    console.error('getUploadedDocumentsAction error:', error)
    return { success: false, error: error.message || 'Failed to load documents' }
  }
}

export async function uploadUploadedDocumentAction(
  clientId: string,
  formData: FormData,
  scheduleId?: string | null
): Promise<
  { success: true; document: UploadedDocument } | { success: false; error: string }
> {
  try {
    const access = scheduleId
      ? await verifyScheduleCompanyAccess(scheduleId, clientId)
      : await verifyClientCompanyAccess(clientId)

    if (!access.ok) return { success: false, error: access.error }

    const file = formData.get('file') as File | null
    const notes = String(formData.get('notes') || '').trim() || null
    const categoryRaw = String(formData.get('category') || '').trim() || null

    if (!file || typeof file.size !== 'number' || file.size === 0) {
      return { success: false, error: 'No file provided' }
    }

    if (
      !UPLOADED_DOCUMENT_ACCEPTED_TYPES.includes(
        file.type as (typeof UPLOADED_DOCUMENT_ACCEPTED_TYPES)[number]
      )
    ) {
      return { success: false, error: 'File type is not supported' }
    }

    if (file.size > UPLOADED_DOCUMENT_MAX_BYTES) {
      return { success: false, error: 'File must be 25 MB or smaller' }
    }

    const categoryResult = resolveUploadCategory(categoryRaw)
    if (!categoryResult.valid) {
      return { success: false, error: categoryResult.error }
    }
    const category = categoryResult.category

    const supabaseAdmin = createSupabaseAdmin()
    const safeName = sanitizeUploadedFileName(file.name)
    const storagePath = scheduleId
      ? `${access.companyId}/uploads/jobs/${scheduleId}/${Date.now()}-${safeName}`
      : `${access.companyId}/uploads/clients/${clientId}/${Date.now()}-${safeName}`

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabaseAdmin.storage
      .from(CLIENT_DOCUMENTS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      return { success: false, error: uploadError.message }
    }

    const { data: document, error: insertError } = await supabaseAdmin
      .from('client_documents')
      .insert({
        client_id: clientId,
        company_id: access.companyId,
        schedule_id: scheduleId || null,
        name: notes || file.name,
        file_name: file.name,
        storage_path: storagePath,
        file_type: file.type,
        source: 'upload',
        category,
        file_size: file.size,
        notes,
        uploaded_by: access.userId,
      })
      .select('*')
      .single()

    if (insertError) {
      await supabaseAdmin.storage.from(CLIENT_DOCUMENTS_BUCKET).remove([storagePath])
      if (insertError.code === '42703') {
        return {
          success: false,
          error: 'Document uploads are not enabled yet. Run supabase/document-uploads-schema.sql.',
        }
      }
      throw insertError
    }

    revalidatePath(`/dashboard/clients/${clientId}`)
    if (scheduleId) {
      revalidatePath(`/dashboard/clients/${clientId}/jobs/${scheduleId}`)
    }

    return { success: true, document: document as UploadedDocument }
  } catch (error: any) {
    console.error('uploadUploadedDocumentAction error:', error)
    return { success: false, error: error.message || 'Failed to upload document' }
  }
}

export async function deleteUploadedDocumentAction(
  documentId: string,
  clientId: string,
  scheduleId?: string | null
) {
  try {
    const access = scheduleId
      ? await verifyScheduleCompanyAccess(scheduleId, clientId)
      : await verifyClientCompanyAccess(clientId)

    if (!access.ok) return { success: false, error: access.error }

    const supabaseAdmin = createSupabaseAdmin()
    let query = supabaseAdmin
      .from('client_documents')
      .select('id, storage_path, company_id, source, schedule_id')
      .eq('id', documentId)
      .eq('client_id', clientId)
      .eq('company_id', access.companyId)
      .eq('source', 'upload')

    if (scheduleId) {
      query = query.eq('schedule_id', scheduleId)
    } else {
      query = query.is('schedule_id', null)
    }

    const { data: document, error: documentError } = await query.single()

    if (documentError || !document) {
      return { success: false, error: 'Document not found' }
    }

    const { error: deleteRowError } = await supabaseAdmin
      .from('client_documents')
      .delete()
      .eq('id', documentId)

    if (deleteRowError) throw deleteRowError

    await supabaseAdmin.storage.from(CLIENT_DOCUMENTS_BUCKET).remove([document.storage_path])

    revalidatePath(`/dashboard/clients/${clientId}`)
    if (scheduleId) {
      revalidatePath(`/dashboard/clients/${clientId}/jobs/${scheduleId}`)
    }

    return { success: true }
  } catch (error: any) {
    console.error('deleteUploadedDocumentAction error:', error)
    return { success: false, error: error.message || 'Failed to delete document' }
  }
}

export async function getJobBillingAction(scheduleId: string, clientId: string) {
  const access = await verifyScheduleCompanyAccess(scheduleId, clientId)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()
  const schedule = access.schedule

  try {

    const { data: lineItems, error: lineError } = await supabaseAdmin
      .from('billing_line_items')
      .select('*')
      .eq('schedule_id', scheduleId)
      .order('created_at', { ascending: true })

    if (lineError) throw lineError

    const { data: payments, error: paymentError } = await supabaseAdmin
      .from('billing_payments')
      .select('*')
      .eq('schedule_id', scheduleId)
      .order('payment_date', { ascending: false })

    if (paymentError) throw paymentError

    const summary = calcBillingSummary(lineItems || [], payments || [])

    let invoiceDocument = await fetchInvoiceDocumentMeta(supabaseAdmin, scheduleId)

    if ((lineItems || []).length > 0 && !invoiceDocument) {
      try {
        await syncJobInvoiceDocument(scheduleId)
        invoiceDocument = await fetchInvoiceDocumentMeta(supabaseAdmin, scheduleId)
      } catch (error) {
        console.error('getJobBillingAction invoice sync error:', error)
      }
    }

    const {
      loadJobPaymentPlanProgress,
      isJobPaymentPlansEnabled,
    } = await import('@/lib/payment-plans-server')
    const {
      computeCanPay,
      computeImplicitFullBalancePayable,
    } = await import('@/lib/payment-plans')
    const { isJobBillableForClient } = await import('@/lib/portal-jobs')

    const billable = isJobBillableForClient(
      { status: schedule.status, startTime: schedule.start_time },
      new Date()
    )
    const paymentPlan = isJobPaymentPlansEnabled()
      ? await loadJobPaymentPlanProgress(supabaseAdmin, scheduleId, {
          status: schedule.status,
          startTime: schedule.start_time,
        })
      : null

    let amountDueNow: number
    let maxPayableNow: number
    let canPay: boolean

    if (paymentPlan) {
      amountDueNow = paymentPlan.amountDueNow
      maxPayableNow = paymentPlan.maxPayableNow
      canPay = computeCanPay({
        balanceDue: summary.balanceDue,
        lineItemCount: (lineItems || []).length,
        billable,
        plan: {
          allowPayAhead: paymentPlan.allowPayAhead,
          amountDueNow: paymentPlan.amountDueNow,
          hasCollectibleNow: paymentPlan.hasCollectibleNow,
        },
      })
    } else {
      const imp = computeImplicitFullBalancePayable({
        totalCharged: summary.totalCharged,
        totalPaid: summary.totalPaid,
        billable,
      })
      amountDueNow = imp.amountDueNow
      maxPayableNow = imp.maxPayableNow
      canPay = computeCanPay({
        balanceDue: summary.balanceDue,
        lineItemCount: (lineItems || []).length,
        billable,
        plan: null,
      })
    }

    return {
      success: true,
      billing: {
        scheduleId: schedule.id,
        title: schedule.title,
        startTime: schedule.start_time,
        status: schedule.status,
        listPrice: schedule.price || 0,
        lineItems: lineItems || [],
        payments: payments || [],
        summary,
        invoiceDocument: invoiceDocument || null,
        amountDueNow,
        maxPayableNow,
        canPay,
        paymentPlan,
        recurringRuleId: schedule.recurring_rule_id ?? null,
      },
    }
  } catch (error: any) {
    console.error('getJobBillingAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function getClientBillingAction(clientId: string) {
  const access = await verifyClientCompanyAccess(clientId)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { data: schedules, error: scheduleError } = await supabaseAdmin
      .from('schedules')
      .select('id, title, start_time, status, price')
      .eq('client_id', clientId)
      .order('start_time', { ascending: false })

    if (scheduleError) throw scheduleError

    const scheduleIds = (schedules || []).map((s) => s.id)

    let lineItems: any[] = []
    let payments: any[] = []

    if (scheduleIds.length > 0) {
      const { data: lines, error: lineError } = await supabaseAdmin
        .from('billing_line_items')
        .select('*')
        .in('schedule_id', scheduleIds)

      if (lineError) throw lineError
      lineItems = lines || []

      const { data: pays, error: payError } = await supabaseAdmin
        .from('billing_payments')
        .select('*')
        .in('schedule_id', scheduleIds)

      if (payError) throw payError
      payments = pays || []
    }

    const jobs = (schedules || []).map((schedule) => {
      const jobLines = lineItems.filter((l) => l.schedule_id === schedule.id)
      const jobPayments = payments.filter((p) => p.schedule_id === schedule.id)
      return {
        scheduleId: schedule.id,
        title: schedule.title,
        startTime: schedule.start_time,
        status: schedule.status,
        listPrice: schedule.price || 0,
        lineItems: jobLines,
        payments: jobPayments,
        summary: calcBillingSummary(jobLines, jobPayments),
      }
    })

    const summary = calcBillingSummary(lineItems, payments)

    return { success: true, billing: { summary, jobs } }
  } catch (error: any) {
    console.error('getClientBillingAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function addBillingLineItemAction(data: {
  scheduleId: string
  clientId: string
  companyId: string
  description: string
  quantity: number
  unitPrice: number
}) {
  const access = await verifyScheduleCompanyAccess(data.scheduleId, data.clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const amount = calcLineAmount(data.quantity, data.unitPrice)

    const { data: item, error } = await supabaseAdmin
      .from('billing_line_items')
      .insert({
        schedule_id: data.scheduleId,
        client_id: data.clientId,
        company_id: access.companyId,
        description: data.description.trim(),
        quantity: data.quantity,
        unit_price: data.unitPrice,
        amount,
      })
      .select()
      .single()

    if (error) throw error

    try {
      const { rebalanceJobPaymentPlan } = await import('@/lib/payment-plans-server')
      await rebalanceJobPaymentPlan(supabaseAdmin, data.scheduleId)
    } catch (planError) {
      console.error('addBillingLineItemAction plan rebalance error:', planError)
    }

    try {
      await refreshJobInvoice(data.scheduleId)
    } catch (invoiceError) {
      console.error('addBillingLineItemAction invoice sync error:', invoiceError)
    }

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.scheduleId}`)
    revalidatePath('/dashboard/payments')
    revalidatePath('/dashboard/reports')

    return { success: true, item }
  } catch (error: any) {
    console.error('addBillingLineItemAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function updateBillingLineItemAction(data: {
  id: string
  scheduleId: string
  clientId: string
  companyId: string
  description: string
  quantity: number
  unitPrice: number
}) {
  const access = await verifyScheduleCompanyAccess(data.scheduleId, data.clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const amount = calcLineAmount(data.quantity, data.unitPrice)

    const { data: item, error } = await supabaseAdmin
      .from('billing_line_items')
      .update({
        description: data.description.trim(),
        quantity: data.quantity,
        unit_price: data.unitPrice,
        amount,
      })
      .eq('id', data.id)
      .eq('schedule_id', data.scheduleId)
      .select()
      .single()

    if (error) throw error

    try {
      const { rebalanceJobPaymentPlan } = await import('@/lib/payment-plans-server')
      await rebalanceJobPaymentPlan(supabaseAdmin, data.scheduleId)
    } catch (planError) {
      console.error('updateBillingLineItemAction plan rebalance error:', planError)
    }

    try {
      await refreshJobInvoice(data.scheduleId)
    } catch (invoiceError) {
      console.error('updateBillingLineItemAction invoice sync error:', invoiceError)
    }

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.scheduleId}`)
    revalidatePath('/dashboard/payments')
    revalidatePath('/dashboard/reports')

    return { success: true, item }
  } catch (error: any) {
    console.error('updateBillingLineItemAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteBillingLineItemAction(
  id: string,
  scheduleId: string,
  clientId: string,
  companyId: string
) {
  const access = await verifyScheduleCompanyAccess(scheduleId, clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { error } = await supabaseAdmin
      .from('billing_line_items')
      .delete()
      .eq('id', id)
      .eq('schedule_id', scheduleId)

    if (error) throw error

    try {
      const { rebalanceJobPaymentPlan } = await import('@/lib/payment-plans-server')
      await rebalanceJobPaymentPlan(supabaseAdmin, scheduleId)
    } catch (planError) {
      console.error('deleteBillingLineItemAction plan rebalance error:', planError)
    }

    try {
      await refreshJobInvoice(scheduleId)
    } catch (invoiceError) {
      console.error('deleteBillingLineItemAction invoice sync error:', invoiceError)
    }

    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath(`/dashboard/clients/${clientId}/jobs/${scheduleId}`)
    revalidatePath('/dashboard/payments')
    revalidatePath('/dashboard/reports')

    return { success: true }
  } catch (error: any) {
    console.error('deleteBillingLineItemAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function addBillingPaymentAction(data: {
  scheduleId: string
  clientId: string
  companyId: string
  amount: number
  paymentDate: string
  method: string
  notes?: string
  installmentId?: string
}) {
  const access = await verifyScheduleCompanyAccess(data.scheduleId, data.clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const schedule = access.schedule

  try {
    const [{ data: lineItems }, { data: existingPayments }, { data: client }] = await Promise.all([
      supabaseAdmin.from('billing_line_items').select('amount').eq('schedule_id', data.scheduleId),
      supabaseAdmin.from('billing_payments').select('amount').eq('schedule_id', data.scheduleId),
      supabaseAdmin
        .from('clients')
        .select('name, email')
        .eq('id', data.clientId)
        .eq('company_id', access.companyId)
        .single(),
    ])

    const summary = calcBillingSummary(lineItems || [], existingPayments || [])
    if (summary.balanceDue <= 0) {
      return { success: false, error: 'This job has no balance due' }
    }

    const roundedAmount = Math.round(data.amount * 100) / 100
    if (roundedAmount <= 0) {
      return { success: false, error: 'Enter a valid payment amount' }
    }

    if (roundedAmount > summary.balanceDue + 0.009) {
      return {
        success: false,
        error: `Payment cannot exceed balance due ($${summary.balanceDue.toFixed(2)})`,
      }
    }

    const { validateManualPaymentAgainstPlan, refreshInstallmentStatuses } = await import(
      '@/lib/payment-plans-server'
    )
    const planCheck = await validateManualPaymentAgainstPlan(supabaseAdmin, {
      scheduleId: data.scheduleId,
      amount: roundedAmount,
      installmentId: data.installmentId || null,
      balanceDue: summary.balanceDue,
      schedule: { status: schedule.status, startTime: schedule.start_time },
    })
    if (!planCheck.ok) {
      return { success: false, error: planCheck.error }
    }

    const insertRow: Record<string, unknown> = {
      schedule_id: data.scheduleId,
      client_id: data.clientId,
      company_id: access.companyId,
      amount: roundedAmount,
      payment_date: data.paymentDate,
      method: data.method,
      notes: data.notes?.trim() || null,
      source: 'manual',
    }
    if (data.installmentId) {
      insertRow.installment_id = data.installmentId
    }

    let payment: Record<string, unknown> | null = null
    {
      const { data: inserted, error } = await supabaseAdmin
        .from('billing_payments')
        .insert(insertRow)
        .select()
        .single()

      if (error) {
        if (
          data.installmentId &&
          (error.message?.includes('installment_id') || error.code === '42703')
        ) {
          delete insertRow.installment_id
          const retry = await supabaseAdmin
            .from('billing_payments')
            .insert(insertRow)
            .select()
            .single()
          if (retry.error) throw retry.error
          payment = retry.data
        } else {
          throw error
        }
      } else {
        payment = inserted
      }
    }

    const { notifyPaymentReceived } = await import('@/lib/notifications-server')
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name')
      .eq('id', access.companyId)
      .single()

    void queueNotification(supabaseAdmin, async (admin) => {
      await notifyPaymentReceived(admin, {
        companyId: access.companyId,
        companyName: company?.name,
        clientEmail: client?.email,
        clientName: client?.name,
        jobTitle: schedule.title || 'Job',
        amount: roundedAmount,
        scheduleId: data.scheduleId,
        clientId: data.clientId,
        paymentMethod: data.method,
      })
    })

    try {
      await refreshInstallmentStatuses(supabaseAdmin, data.scheduleId)
    } catch (planError) {
      console.error('addBillingPaymentAction installment refresh error:', planError)
    }

    try {
      await refreshJobInvoice(data.scheduleId)
    } catch (invoiceError) {
      console.error('addBillingPaymentAction invoice sync error:', invoiceError)
    }

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.scheduleId}`)
    revalidatePath('/dashboard/payments')
    revalidatePath('/dashboard/reports')

    return { success: true, payment }
  } catch (error: any) {
    console.error('addBillingPaymentAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteBillingPaymentAction(
  id: string,
  scheduleId: string,
  clientId: string,
  companyId: string
) {
  const access = await verifyScheduleCompanyAccess(scheduleId, clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { data: payment, error: fetchError } = await supabaseAdmin
      .from('billing_payments')
      .select('source')
      .eq('id', id)
      .eq('schedule_id', scheduleId)
      .single()

    if (fetchError || !payment) {
      return { success: false, error: 'Payment not found' }
    }

    if (payment.source === 'stripe') {
      return { success: false, error: 'Client portal payments cannot be deleted here' }
    }

    const { error } = await supabaseAdmin
      .from('billing_payments')
      .delete()
      .eq('id', id)
      .eq('schedule_id', scheduleId)

    if (error) throw error

    try {
      const { refreshInstallmentStatuses } = await import('@/lib/payment-plans-server')
      await refreshInstallmentStatuses(supabaseAdmin, scheduleId)
    } catch (planError) {
      console.error('deleteBillingPaymentAction installment refresh error:', planError)
    }

    try {
      await refreshJobInvoice(scheduleId)
    } catch (invoiceError) {
      console.error('deleteBillingPaymentAction invoice sync error:', invoiceError)
    }

    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath(`/dashboard/clients/${clientId}/jobs/${scheduleId}`)
    revalidatePath('/dashboard/payments')
    revalidatePath('/dashboard/reports')

    return { success: true }
  } catch (error: any) {
    console.error('deleteBillingPaymentAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function setJobPaymentPlanAction(data: {
  scheduleId: string
  clientId: string
  companyId: string
  template: import('@/lib/payment-plans').JobPaymentPlanTemplate
  applyMode?: 'this_visit' | 'all_future'
  includeCustomized?: boolean
  confirmReallocate?: boolean
}) {
  const access = await verifyScheduleCompanyAccess(data.scheduleId, data.clientId)
  if (!access.ok) return { success: false as const, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false as const, error: 'Unauthorized' }
  }

  try {
    const { setJobPaymentPlan } = await import('@/lib/payment-plans-server')
    const supabaseAdmin = createSupabaseAdmin()
    const result = await setJobPaymentPlan(supabaseAdmin, {
      scheduleId: data.scheduleId,
      clientId: data.clientId,
      companyId: access.companyId,
      template: data.template,
      applyMode: data.applyMode || 'this_visit',
      includeCustomized: data.includeCustomized,
      confirmReallocate: data.confirmReallocate,
    })

    if (!result.success) {
      return { success: false as const, error: result.error || 'Could not set payment plan' }
    }

    // Invoice PDFs embed installment schedules — resync current + any all-future visits.
    const scheduleIdsToSync = result.updatedScheduleIds?.length
      ? result.updatedScheduleIds
      : [data.scheduleId]
    for (const scheduleId of scheduleIdsToSync) {
      try {
        await refreshJobInvoice(scheduleId)
      } catch (invoiceError) {
        console.error(
          'setJobPaymentPlanAction invoice sync error:',
          scheduleId,
          invoiceError
        )
      }
    }

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.scheduleId}`)

    return {
      success: true as const,
      allocatedExistingPayments: result.allocatedExistingPayments,
      allFuture: result.allFuture,
    }
  } catch (error: any) {
    console.error('setJobPaymentPlanAction error:', error)
    return { success: false as const, error: error.message }
  }
}

export async function resetJobPaymentPlanAction(data: {
  scheduleId: string
  clientId: string
  companyId: string
  confirmReallocate?: boolean
}) {
  const access = await verifyScheduleCompanyAccess(data.scheduleId, data.clientId)
  if (!access.ok) return { success: false as const, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false as const, error: 'Unauthorized' }
  }

  try {
    const { resetJobPaymentPlan } = await import('@/lib/payment-plans-server')
    const supabaseAdmin = createSupabaseAdmin()
    const result = await resetJobPaymentPlan(supabaseAdmin, {
      scheduleId: data.scheduleId,
      clientId: data.clientId,
      companyId: access.companyId,
      confirmReallocate: data.confirmReallocate,
    })

    if (!result.success) {
      return { success: false as const, error: result.error || 'Could not reset payment plan' }
    }

    const scheduleIdsToSync = result.updatedScheduleIds?.length
      ? result.updatedScheduleIds
      : [data.scheduleId]
    for (const scheduleId of scheduleIdsToSync) {
      try {
        await refreshJobInvoice(scheduleId)
      } catch (invoiceError) {
        console.error(
          'resetJobPaymentPlanAction invoice sync error:',
          scheduleId,
          invoiceError
        )
      }
    }

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.scheduleId}`)

    return {
      success: true as const,
      allocatedExistingPayments: result.allocatedExistingPayments,
    }
  } catch (error: any) {
    console.error('resetJobPaymentPlanAction error:', error)
    return { success: false as const, error: error.message }
  }
}

export async function getCompanyJobPaymentSettingsAction(companyId: string) {
  const access = await verifyCompanyStaff()
  if (!access.ok) return { success: false as const, error: access.error }
  if (access.companyId !== companyId) {
    return { success: false as const, error: 'Unauthorized' }
  }

  try {
    const { getCompanyJobPaymentSettings } = await import('@/lib/payment-plans-server')
    const supabaseAdmin = createSupabaseAdmin()
    const settings = await getCompanyJobPaymentSettings(supabaseAdmin, companyId)
    return { success: true as const, settings }
  } catch (error: any) {
    console.error('getCompanyJobPaymentSettingsAction error:', error)
    return { success: false as const, error: error.message }
  }
}

export async function updateCompanyJobPaymentSettingsAction(
  companyId: string,
  settings: { defaultPlan: import('@/lib/payment-plans').JobPaymentPlanTemplate }
) {
  const access = await verifyCompanyStaff()
  if (!access.ok) return { success: false as const, error: access.error }
  if (access.companyId !== companyId) {
    return { success: false as const, error: 'Unauthorized' }
  }
  // Prefer admin for company-wide billing policy
  if (access.session.profile.role !== 'company_admin') {
    return { success: false as const, error: 'Only company admins can change payment plan defaults' }
  }

  try {
    const { updateCompanyJobPaymentSettings } = await import('@/lib/payment-plans-server')
    const supabaseAdmin = createSupabaseAdmin()
    const saved = await updateCompanyJobPaymentSettings(supabaseAdmin, companyId, settings)
    revalidatePath('/dashboard/settings')
    return { success: true as const, settings: saved }
  } catch (error: any) {
    console.error('updateCompanyJobPaymentSettingsAction error:', error)
    return { success: false as const, error: error.message }
  }
}

export async function relinkBillingPaymentInstallmentAction(data: {
  paymentId: string
  scheduleId: string
  clientId: string
  companyId: string
  installmentId: string | null
}) {
  const access = await verifyScheduleCompanyAccess(data.scheduleId, data.clientId)
  if (!access.ok) return { success: false as const, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false as const, error: 'Unauthorized' }
  }

  try {
    const { relinkBillingPaymentInstallment } = await import('@/lib/payment-plans-server')
    const supabaseAdmin = createSupabaseAdmin()
    const result = await relinkBillingPaymentInstallment(supabaseAdmin, {
      paymentId: data.paymentId,
      scheduleId: data.scheduleId,
      installmentId: data.installmentId,
    })

    if (!result.ok) {
      return { success: false as const, error: result.error }
    }

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.scheduleId}`)
    revalidatePath('/dashboard/payments')

    return { success: true as const }
  } catch (error: any) {
    console.error('relinkBillingPaymentInstallmentAction error:', error)
    return { success: false as const, error: error.message }
  }
}

export async function generateJobInvoiceAction(scheduleId: string, clientId: string) {
  try {
    const access = await verifyScheduleCompanyAccess(scheduleId, clientId)
    if (!access.ok) return { success: false, error: access.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: lineItems } = await supabaseAdmin
      .from('billing_line_items')
      .select('id')
      .eq('schedule_id', scheduleId)
      .limit(1)

    if (!lineItems || lineItems.length === 0) {
      return { success: false, error: 'Add at least one line item to generate an invoice' }
    }

    const invoice = await syncJobInvoiceDocument(scheduleId)
    if (!invoice) {
      return { success: false, error: 'Could not generate invoice' }
    }

    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath(`/dashboard/clients/${clientId}/jobs/${scheduleId}`)

    return { success: true, documentId: invoice.documentId }
  } catch (error: any) {
    console.error('generateJobInvoiceAction error:', error)
    return {
      success: false,
      error: error.message || 'Failed to generate invoice',
    }
  }
}

export async function sendJobInvoiceAction(scheduleId: string, clientId: string) {
  const access = await verifyScheduleCompanyAccess(scheduleId, clientId)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()
  const schedule = access.schedule
  const companyId = access.companyId

  try {
    const { data: lineItems } = await supabaseAdmin
      .from('billing_line_items')
      .select('id')
      .eq('schedule_id', scheduleId)
      .limit(1)

    if (!lineItems || lineItems.length === 0) {
      return { success: false, error: 'Add line items before sending an invoice' }
    }

    const generated = await generateJobInvoiceAction(scheduleId, clientId)
    if (!generated.success) {
      return generated
    }

    const [{ data: fullLineItems }, { data: payments }, { data: client }, { data: company }] =
      await Promise.all([
        supabaseAdmin.from('billing_line_items').select('amount').eq('schedule_id', scheduleId),
        supabaseAdmin.from('billing_payments').select('amount').eq('schedule_id', scheduleId),
        supabaseAdmin
          .from('clients')
          .select('name, email, phone')
          .eq('id', clientId)
          .single(),
        supabaseAdmin.from('companies').select('name').eq('id', companyId).single(),
      ])

    const summary = calcBillingSummary(fullLineItems || [], payments || [])

    void queueNotification(supabaseAdmin, async (admin) => {
      await notifyClientInvoiceSent(admin, {
        companyId,
        companyName: company?.name,
        clientId,
        clientEmail: client?.email,
        clientPhone: client?.phone,
        clientName: client?.name,
        jobTitle: schedule.title || 'Job',
        balanceDue: summary.balanceDue,
        scheduleId,
      })
    })

    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath(`/dashboard/clients/${clientId}/jobs/${scheduleId}`)

    return { success: true, documentId: generated.documentId }
  } catch (error: any) {
    console.error('sendJobInvoiceAction error:', error)
    return { success: false, error: error.message || 'Failed to send invoice' }
  }
}

export async function getCompanyPaymentsAction(options?: {
  period?: ReportsPeriod
  source?: PaymentsFilterSource
  search?: string
  page?: number
  pageSize?: number
}): Promise<
  | {
      success: true
      payments: CompanyPaymentRow[]
      summary: PaymentsSummary
      periodLabel: string
      pagination: {
        page: number
        pageSize: number
        total: number
        hasMore: boolean
      }
    }
  | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }
    if (check.session.profile.role !== 'company_admin') {
      return { success: false, error: 'Only company admins can view all transactions' }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const companyId = check.companyId
    const period = options?.period ?? '30d'
    const source = options?.source ?? 'all'
    const search = options?.search?.trim() ?? ''
    const page = Math.max(1, options?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? DEFAULT_PAYMENTS_PAGE_SIZE))

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('timezone')
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Company not found' }
    }

    const timezone = company.timezone || 'America/Chicago'
    const bounds = getReportsPeriodBounds(period, timezone)

    const [pageResult, summary] = await Promise.all([
      fetchCompanyPaymentsPage({
        supabaseAdmin,
        companyId,
        bounds,
        source,
        search,
        page,
        pageSize,
      }),
      fetchCompanyPaymentsSummary({
        supabaseAdmin,
        companyId,
        bounds,
        source,
        search,
      }),
    ])

    const rows: CompanyPaymentRow[] = pageResult.payments.map(mapPaymentRow)

    return {
      success: true,
      payments: rows,
      summary,
      periodLabel: bounds.start
        ? `${bounds.start.toLocaleDateString()} – ${bounds.end.toLocaleDateString()}`
        : 'All time',
      pagination: {
        page,
        pageSize,
        total: pageResult.total,
        hasMore: page * pageSize < pageResult.total,
      },
    }
  } catch (error: any) {
    console.error('getCompanyPaymentsAction error:', error)
    return { success: false, error: error.message || 'Failed to load payments' }
  }
}

// ============================================
// Estimates & Documents
// ============================================

async function verifyClientOwnership(clientId: string, companyId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const { data } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('company_id', companyId)
    .single()
  return !!data
}

async function verifyEstimateOwnership(estimateId: string, clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const { data } = await supabaseAdmin
    .from('estimates')
    .select('id, status, schedule_id, title, description, total, company_id')
    .eq('id', estimateId)
    .eq('client_id', clientId)
    .single()
  return data
}

async function verifyEstimateCompanyAccess(estimateId: string, clientId: string) {
  const access = await verifyClientCompanyAccess(clientId)
  if (!access.ok) return access

  const estimate = await verifyEstimateOwnership(estimateId, clientId)
  if (!estimate || estimate.company_id !== access.companyId) {
    return { ok: false as const, error: 'Estimate not found' }
  }

  return { ...access, estimate }
}

export async function getClientEstimatesAction(clientId: string) {
  const access = await verifyClientCompanyAccess(clientId)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { data: estimates, error } = await supabaseAdmin
      .from('estimates')
      .select(`
        *,
        line_items:estimate_line_items (*),
        document:client_documents (id)
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const sorted = (estimates || []).map((est: any) => ({
      ...est,
      line_items: (est.line_items || []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
      ),
    }))

    return { success: true, estimates: sorted }
  } catch (error: any) {
    console.error('getClientEstimatesAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function getClientDocumentsAction(clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const staffCheck = await verifyCompanyStaff()
    if (staffCheck.ok) {
      const companyId = await getCompanyIdForClient(clientId)
      if (!companyId || companyId !== staffCheck.companyId) {
        return { success: false, error: 'Client not found' }
      }
    } else {
      const session = await getSessionProfile()
      if (
        !session ||
        session.profile.role !== 'client' ||
        session.profile.client_id !== clientId
      ) {
        return { success: false, error: 'Unauthorized' }
      }

      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('portal_enabled')
        .eq('id', clientId)
        .single()

      if (!client?.portal_enabled) {
        return { success: false, error: 'Portal access disabled' }
      }
    }

    const { data: documents, error } = await supabaseAdmin
      .from('client_documents')
      .select('*')
      .eq('client_id', clientId)
      .in('source', ['estimate', 'invoice'])
      .order('created_at', { ascending: false })

    if (error) throw error

    const allDocuments = documents || []
    const estimates = allDocuments.filter((doc) => doc.source === 'estimate')
    const invoices = allDocuments.filter((doc) => doc.source === 'invoice')

    return { success: true, documents: estimates, invoices }
  } catch (error: any) {
    console.error('getClientDocumentsAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function createEstimateAction(data: {
  clientId: string
  companyId: string
  title: string
  description?: string
}) {
  const access = await verifyClientCompanyAccess(data.clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { data: estimate, error } = await supabaseAdmin
      .from('estimates')
      .insert({
        client_id: data.clientId,
        company_id: access.companyId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        status: 'draft',
        total: 0,
      })
      .select()
      .single()

    if (error) throw error

    await syncEstimateDocument(estimate.id)

    revalidatePath(`/dashboard/clients/${data.clientId}`)

    return { success: true, estimate }
  } catch (error: any) {
    console.error('createEstimateAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function updateEstimateAction(data: {
  id: string
  clientId: string
  companyId: string
  title?: string
  description?: string
  status?: string
}) {
  const access = await verifyEstimateCompanyAccess(data.id, data.clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const estimate = access.estimate

  try {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (data.title !== undefined) updates.title = data.title.trim()
    if (data.description !== undefined) updates.description = data.description?.trim() || null
    if (data.status !== undefined) updates.status = data.status

    const { data: updated, error } = await supabaseAdmin
      .from('estimates')
      .update(updates)
      .eq('id', data.id)
      .select()
      .single()

    if (error) throw error

    await syncEstimateDocument(data.id)

    revalidatePath(`/dashboard/clients/${data.clientId}`)

    return { success: true, estimate: updated }
  } catch (error: any) {
    console.error('updateEstimateAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function setEstimateStatusAction(data: {
  id: string
  clientId: string
  companyId: string
  status: 'accepted' | 'declined' | 'sent'
}) {
  const access = await verifyEstimateCompanyAccess(data.id, data.clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const estimate = access.estimate

  try {
    if (estimate.status === 'converted') {
      return { success: false, error: 'Cannot change status of a converted estimate' }
    }

    const { data: updated, error } = await supabaseAdmin
      .from('estimates')
      .update({
        status: data.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .select()
      .single()

    if (error) throw error

    await syncEstimateDocument(data.id)
    revalidatePath(`/dashboard/clients/${data.clientId}`)

    if (data.status === 'sent' && estimate.status !== 'sent') {
      void notifyEstimateSentById(data.id)
    }

    return { success: true, estimate: updated }
  } catch (error: any) {
    console.error('setEstimateStatusAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteEstimateAction(
  id: string,
  clientId: string,
  companyId: string
) {
  const access = await verifyEstimateCompanyAccess(id, clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const estimate = access.estimate

  try {
    if (estimate.status === 'converted') {
      return { success: false, error: 'Cannot delete a converted estimate' }
    }

    const { data: doc } = await supabaseAdmin
      .from('client_documents')
      .select('storage_path')
      .eq('estimate_id', id)
      .maybeSingle()

    const { error } = await supabaseAdmin.from('estimates').delete().eq('id', id)
    if (error) throw error

    if (doc?.storage_path) {
      await supabaseAdmin.storage.from('client-documents').remove([doc.storage_path])
    }

    revalidatePath(`/dashboard/clients/${clientId}`)

    return { success: true }
  } catch (error: any) {
    console.error('deleteEstimateAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function addEstimateLineItemAction(data: {
  estimateId: string
  clientId: string
  companyId: string
  description: string
  quantity: number
  unitPrice: number
}) {
  const access = await verifyEstimateCompanyAccess(data.estimateId, data.clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const estimate = access.estimate

  try {
    if (estimate.status === 'converted') {
      return { success: false, error: 'Cannot edit a converted estimate' }
    }

    const amount = calcLineAmount(data.quantity, data.unitPrice)

    const { count } = await supabaseAdmin
      .from('estimate_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('estimate_id', data.estimateId)

    const { data: item, error } = await supabaseAdmin
      .from('estimate_line_items')
      .insert({
        estimate_id: data.estimateId,
        description: data.description.trim(),
        quantity: data.quantity,
        unit_price: data.unitPrice,
        amount,
        sort_order: count || 0,
      })
      .select()
      .single()

    if (error) throw error

    await recalcEstimateTotal(supabaseAdmin, data.estimateId)
    await applyAutoEstimateStatus(supabaseAdmin, data.estimateId)
    await syncEstimateDocument(data.estimateId)

    revalidatePath(`/dashboard/clients/${data.clientId}`)

    return { success: true, item }
  } catch (error: any) {
    console.error('addEstimateLineItemAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function updateEstimateLineItemAction(data: {
  id: string
  estimateId: string
  clientId: string
  companyId: string
  description: string
  quantity: number
  unitPrice: number
}) {
  const access = await verifyEstimateCompanyAccess(data.estimateId, data.clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const estimate = access.estimate

  try {
    if (estimate.status === 'converted') {
      return { success: false, error: 'Cannot edit a converted estimate' }
    }

    const amount = calcLineAmount(data.quantity, data.unitPrice)

    const { data: item, error } = await supabaseAdmin
      .from('estimate_line_items')
      .update({
        description: data.description.trim(),
        quantity: data.quantity,
        unit_price: data.unitPrice,
        amount,
      })
      .eq('id', data.id)
      .eq('estimate_id', data.estimateId)
      .select()
      .single()

    if (error) throw error

    await recalcEstimateTotal(supabaseAdmin, data.estimateId)
    await applyAutoEstimateStatus(supabaseAdmin, data.estimateId)
    await syncEstimateDocument(data.estimateId)

    revalidatePath(`/dashboard/clients/${data.clientId}`)

    return { success: true, item }
  } catch (error: any) {
    console.error('updateEstimateLineItemAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteEstimateLineItemAction(
  id: string,
  estimateId: string,
  clientId: string,
  companyId: string
) {
  const access = await verifyEstimateCompanyAccess(estimateId, clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const estimate = access.estimate

  try {
    if (estimate.status === 'converted') {
      return { success: false, error: 'Cannot edit a converted estimate' }
    }

    const { error } = await supabaseAdmin
      .from('estimate_line_items')
      .delete()
      .eq('id', id)
      .eq('estimate_id', estimateId)

    if (error) throw error

    await recalcEstimateTotal(supabaseAdmin, estimateId)
    await applyAutoEstimateStatus(supabaseAdmin, estimateId)
    await syncEstimateDocument(estimateId)

    revalidatePath(`/dashboard/clients/${clientId}`)

    return { success: true }
  } catch (error: any) {
    console.error('deleteEstimateLineItemAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function convertEstimateToJobAction(data: {
  estimateId: string
  clientId: string
  companyId: string
  crewId?: string | null
  title: string
  description?: string
  startTime: string
  endTime: string
  recurrence?: string
}) {
  const access = await verifyEstimateCompanyAccess(data.estimateId, data.clientId)
  if (!access.ok) return { success: false, error: access.error }
  if (access.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const estimate = access.estimate

  try {
    if (estimate.status === 'converted') {
      return { success: false, error: 'This estimate has already been converted to a job' }
    }

    if (data.crewId) {
      const { data: conflicting } = await supabaseAdmin
        .from('schedules')
        .select('id')
        .eq('crew_id', data.crewId)
        .neq('status', 'cancelled')
        .lte('start_time', data.endTime)
        .gte('end_time', data.startTime)

      if (conflicting && conflicting.length > 0) {
        const alternatives = await suggestAlternativeCrews(
          access.companyId,
          data.startTime,
          data.endTime,
          data.crewId
        )
        return {
          success: false,
          error: 'Crew is not available at this time',
          suggestedCrews: alternatives,
        }
      }
    }

    let recurringRuleId = null
    if (data.recurrence && data.recurrence !== 'none') {
      const { data: newRule } = await supabaseAdmin
        .from('recurring_rules')
        .insert({ frequency: data.recurrence, interval: 1 })
        .select()
        .single()
      recurringRuleId = newRule?.id
    }

    const jobPrice = Number(estimate.total) || 0

    const { data: newSchedule, error: scheduleError } = await supabaseAdmin
      .from('schedules')
      .insert({
        client_id: data.clientId,
        crew_id: data.crewId || null,
        recurring_rule_id: recurringRuleId,
        title: data.title,
        description: data.description || estimate.description || null,
        start_time: data.startTime,
        end_time: data.endTime,
        status: 'scheduled',
        price: jobPrice,
      })
      .select()
      .single()

    if (scheduleError || !newSchedule) throw scheduleError

    const stripeStatus = await getCompanyStripeStatus(access.companyId)
    if (stripeStatus.billingEnabled) {
      await seedBillingFromEstimate(
        supabaseAdmin,
        newSchedule.id,
        data.clientId,
        access.companyId,
        data.estimateId,
        data.title,
        jobPrice
      )
    }

    await supabaseAdmin
      .from('estimates')
      .update({
        status: 'converted',
        schedule_id: newSchedule.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.estimateId)

    await syncEstimateDocument(data.estimateId)

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${newSchedule.id}`)

    return { success: true, schedule: newSchedule }
  } catch (error: any) {
    console.error('convertEstimateToJobAction error:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// Client portal access
// ============================================

async function verifyCompanyAdminForClient(clientId: string) {
  const session = await getSessionProfile()
  if (!session) return { ok: false as const, error: 'Unauthorized' }

  if (session.profile.role !== 'company_admin') {
    return { ok: false as const, error: 'Only company admins can manage portal access' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, company_id, email, name, auth_user_id, portal_enabled, portal_invited_at')
    .eq('id', clientId)
    .single()

  if (!client || client.company_id !== session.profile.company_id) {
    return { ok: false as const, error: 'Client not found' }
  }

  return { ok: true as const, client, companyId: session.profile.company_id }
}

export type ClientPortalLoginUser = {
  id: string
  email: string | null
  fullName: string | null
  isPrimary: boolean
  createdAt: string | null
  accessExpiresAt: string | null
  isExpired: boolean
}

export async function getClientPortalStatusAction(clientId: string) {
  try {
    const check = await verifyCompanyAdminForClient(clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { client } = check
    const supabaseAdmin = createSupabaseAdmin()
    const { findProfilesByClientId, isPortalAccessExpired } = await import(
      '@/lib/portal-users'
    )
    const profiles = await findProfilesByClientId(supabaseAdmin, clientId)

    const users: ClientPortalLoginUser[] = profiles.map((profile) => ({
      id: profile.id,
      email: profile.email ?? null,
      fullName: profile.full_name ?? null,
      isPrimary: profile.id === client.auth_user_id,
      createdAt: profile.created_at ?? null,
      accessExpiresAt: profile.portal_access_expires_at ?? null,
      isExpired: isPortalAccessExpired(profile.portal_access_expires_at),
    }))

    return {
      success: true,
      status: {
        portalEnabled: client.portal_enabled,
        portalInvitedAt: client.portal_invited_at,
        hasPortalUser: users.length > 0,
        portalUserEmail: users[0]?.email ?? null,
        clientEmail: client.email,
        users,
      },
    }
  } catch (error: any) {
    console.error('getClientPortalStatusAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function inviteClientToPortalAction(
  clientId: string,
  origin: string,
  options?: {
    email?: string
    fullName?: string
    accessDuration?: import('@/lib/portal-users').PortalAccessDuration
  }
) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { client, companyId } = check
    if (!companyId) return { success: false, error: 'Company not found' }

    const email = (
      options?.email?.trim() ||
      client.email?.trim() ||
      ''
    ).toLowerCase()

    if (!email) {
      return {
        success: false,
        error: 'Enter an email for this login, or add a client email first',
      }
    }

    const fullName =
      options?.fullName?.trim() || client.name || email.split('@')[0] || 'Client'
    const { portalAccessExpiresAtFromDuration } = await import('@/lib/portal-users')
    const portalAccessExpiresAt = portalAccessExpiresAtFromDuration(
      options?.accessDuration ?? 'none'
    )

    const emailCheck = await assertPortalEmailAvailable(supabaseAdmin, email, clientId)
    if (!emailCheck.ok) return { success: false, error: emailCheck.error }

    let authUserId: string

    const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, email)
    if (existingAuthUser) {
      // Only reclaim unused auth users (no profile or matching client portal role)
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, role, client_id')
        .eq('id', existingAuthUser.id)
        .maybeSingle()

      if (
        existingProfile &&
        (existingProfile.role !== 'client' ||
          (existingProfile.client_id && existingProfile.client_id !== clientId))
      ) {
        return {
          success: false,
          error: 'This email already belongs to another account',
        }
      }

      authUserId = existingAuthUser.id
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role: 'client',
            company_id: companyId,
            client_id: clientId,
          },
        }
      )
      if (updateError) throw updateError
    } else {
      const { data: inviteData, error: inviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${origin}/login`,
          data: {
            full_name: fullName,
            role: 'client',
            company_id: companyId,
            client_id: clientId,
          },
        })

      if (inviteError) throw inviteError
      if (!inviteData.user) throw new Error('Invite failed')
      authUserId = inviteData.user.id
    }

    await upsertClientPortalProfile(supabaseAdmin, {
      userId: authUserId,
      fullName,
      email,
      companyId,
      clientId,
      portalAccessExpiresAt,
    })

    await linkClientPortalAccess(supabaseAdmin, clientId, authUserId)

    revalidatePath(`/dashboard/clients/${clientId}`)

    return { success: true }
  } catch (error: any) {
    console.error('inviteClientToPortalAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function createClientPortalUserAction(data: {
  clientId: string
  email: string
  password: string
  fullName?: string
  accessDuration?: import('@/lib/portal-users').PortalAccessDuration
}) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(data.clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { client, companyId } = check
    if (!companyId) return { success: false, error: 'Company not found' }

    const email = data.email.trim().toLowerCase()
    const { validatePassword } = await import('@/lib/password-policy')
    const passwordCheck = validatePassword(data.password)
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Enter a valid email address' }
    }
    if (!passwordCheck.ok) {
      return { success: false, error: passwordCheck.error || 'Invalid password' }
    }

    const fullName =
      data.fullName?.trim() || client.name || email.split('@')[0] || 'Client'
    const { portalAccessExpiresAtFromDuration } = await import('@/lib/portal-users')
    const portalAccessExpiresAt = portalAccessExpiresAtFromDuration(
      data.accessDuration ?? 'none'
    )

    const emailCheck = await assertPortalEmailAvailable(
      supabaseAdmin,
      email,
      data.clientId
    )
    if (!emailCheck.ok) return { success: false, error: emailCheck.error }

    let authUserId: string

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'client',
        company_id: companyId,
        client_id: data.clientId,
      },
    })

    if (authError && isEmailAlreadyRegisteredError(authError.message)) {
      const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, email)
      if (!existingAuthUser) throw authError

      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, role, client_id')
        .eq('id', existingAuthUser.id)
        .maybeSingle()

      if (
        existingProfile &&
        (existingProfile.role !== 'client' ||
          (existingProfile.client_id && existingProfile.client_id !== data.clientId))
      ) {
        return {
          success: false,
          error: 'This email already belongs to another account',
        }
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          email,
          password: data.password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role: 'client',
            company_id: companyId,
            client_id: data.clientId,
          },
        }
      )
      if (updateError) throw updateError
      authUserId = existingAuthUser.id
    } else if (authError) {
      throw authError
    } else if (!authData.user) {
      throw new Error('Failed to create portal user')
    } else {
      authUserId = authData.user.id
    }

    await upsertClientPortalProfile(supabaseAdmin, {
      userId: authUserId,
      fullName,
      email,
      companyId,
      clientId: data.clientId,
      portalAccessExpiresAt,
    })

    await linkClientPortalAccess(
      supabaseAdmin,
      data.clientId,
      authUserId,
      client.email || email
    )

    revalidatePath(`/dashboard/clients/${data.clientId}`)

    return { success: true }
  } catch (error: any) {
    console.error('createClientPortalUserAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function updateClientPortalUserAction(data: {
  clientId: string
  userId: string
  fullName?: string
  accessDuration?: import('@/lib/portal-users').PortalAccessDuration
}) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(data.clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, client_id, full_name, email')
      .eq('id', data.userId)
      .maybeSingle()

    if (
      !profile ||
      profile.role !== 'client' ||
      profile.client_id !== data.clientId
    ) {
      return { success: false, error: 'Portal login not found for this client' }
    }

    const fullName = data.fullName?.trim() || profile.full_name || 'Client'
    const { portalAccessExpiresAtFromDuration } = await import('@/lib/portal-users')

    const updates: Record<string, unknown> = {
      full_name: fullName,
    }
    if (data.accessDuration !== undefined) {
      updates.portal_access_expires_at = portalAccessExpiresAtFromDuration(
        data.accessDuration
      )
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', data.userId)

    if (profileError) throw profileError

    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      user_metadata: {
        full_name: fullName,
        role: 'client',
        company_id: check.companyId,
        client_id: data.clientId,
      },
    })

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    return { success: true }
  } catch (error: any) {
    console.error('updateClientPortalUserAction error:', error)
    return { success: false, error: error.message }
  }
}

/** Company admin sets a temporary password for a portal login. */
export async function setClientPortalUserPasswordAction(data: {
  clientId: string
  userId: string
  password: string
}) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(data.clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, client_id')
      .eq('id', data.userId)
      .maybeSingle()

    if (
      !profile ||
      profile.role !== 'client' ||
      profile.client_id !== data.clientId
    ) {
      return { success: false, error: 'Portal login not found for this client' }
    }

    const { validatePassword } = await import('@/lib/password-policy')
    const passwordCheck = validatePassword(data.password)
    if (!passwordCheck.ok) {
      return { success: false, error: passwordCheck.error || 'Invalid password' }
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    })
    if (error) throw error

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    return { success: true }
  } catch (error: any) {
    console.error('setClientPortalUserPasswordAction error:', error)
    return { success: false, error: error.message }
  }
}

/** Start a staff preview session of this client's portal (httpOnly cookie). */
export async function startClientPortalPreviewAction(clientId: string) {
  try {
    const check = await verifyCompanyAdminForClient(clientId)
    if (!check.ok) return { success: false as const, error: check.error }

    const { cookies } = await import('next/headers')
    const { PORTAL_PREVIEW_CLIENT_COOKIE } = await import('@/lib/portal-auth')
    const cookieStore = await cookies()
    cookieStore.set(PORTAL_PREVIEW_CLIENT_COOKIE, clientId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    })

    return { success: true as const, portalPath: '/portal' as const }
  } catch (error: any) {
    console.error('startClientPortalPreviewAction error:', error)
    return { success: false as const, error: error.message || 'Failed to start preview' }
  }
}

/** End staff portal preview and return to the client portal tab. */
export async function exitClientPortalPreviewAction() {
  try {
    const { cookies } = await import('next/headers')
    const { PORTAL_PREVIEW_CLIENT_COOKIE, getPortalPreviewClientIdFromCookies } =
      await import('@/lib/portal-auth')
    const cookieStore = await cookies()
    const clientId = await getPortalPreviewClientIdFromCookies()
    cookieStore.set(PORTAL_PREVIEW_CLIENT_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })

    return {
      success: true as const,
      returnPath: clientId
        ? `/dashboard/clients/${clientId}?tab=portal`
        : '/dashboard/clients',
    }
  } catch (error: any) {
    console.error('exitClientPortalPreviewAction error:', error)
    return {
      success: false as const,
      error: error.message || 'Failed to exit preview',
      returnPath: '/dashboard/clients',
    }
  }
}

/** Send a password-reset email to a portal login. */
export async function sendClientPortalUserPasswordResetAction(data: {
  clientId: string
  userId: string
}) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(data.clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, client_id, email')
      .eq('id', data.userId)
      .maybeSingle()

    if (
      !profile ||
      profile.role !== 'client' ||
      profile.client_id !== data.clientId
    ) {
      return { success: false, error: 'Portal login not found for this client' }
    }

    const email = profile.email?.trim().toLowerCase()
    if (!email) {
      return { success: false, error: 'This login has no email address' }
    }

    const {
      buildPasswordResetVerifyUrl,
      getPasswordResetRedirectUrl,
    } = await import('@/lib/auth-password-reset')
    const { sendPasswordResetEmail } = await import('@/lib/email/password-reset-email')
    const { isResendConfigured } = await import('@/lib/email/resend')

    if (isResendConfigured()) {
      const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
      })
      if (error || !linkData?.properties?.hashed_token) {
        throw error || new Error('Could not generate reset link')
      }
      const resetUrl = buildPasswordResetVerifyUrl(linkData.properties.hashed_token)
      const sendResult = await sendPasswordResetEmail({ to: email, resetUrl })
      if (!sendResult.ok) {
        return { success: false, error: sendResult.error || 'Failed to send reset email' }
      }
    } else {
      // Fallback: Supabase Auth email (requires Auth email templates configured)
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getPasswordResetRedirectUrl(),
      })
      if (error) throw error
    }

    return { success: true }
  } catch (error: any) {
    console.error('sendClientPortalUserPasswordResetAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function setClientPortalEnabledAction(clientId: string, enabled: boolean) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { findProfilesByClientId } = await import('@/lib/portal-users')
    const users = await findProfilesByClientId(supabaseAdmin, clientId)
    if (users.length === 0 && !check.client.auth_user_id) {
      return { success: false, error: 'Add a portal login first' }
    }

    await supabaseAdmin
      .from('clients')
      .update({ portal_enabled: enabled })
      .eq('id', clientId)

    revalidatePath(`/dashboard/clients/${clientId}`)

    return { success: true }
  } catch (error: any) {
    console.error('setClientPortalEnabledAction error:', error)
    return { success: false, error: error.message }
  }
}

/** Remove a single household login without revoking the whole portal. */
export async function revokeClientPortalUserAction(clientId: string, userId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, client_id')
      .eq('id', userId)
      .maybeSingle()

    if (
      !profile ||
      profile.role !== 'client' ||
      profile.client_id !== clientId
    ) {
      return { success: false, error: 'Portal login not found for this client' }
    }

    await supabaseAdmin.from('profiles').delete().eq('id', userId)
    await supabaseAdmin.auth.admin.deleteUser(userId)

    const { refreshClientPortalPrimaryUser } = await import('@/lib/portal-users')
    await refreshClientPortalPrimaryUser(supabaseAdmin, clientId)

    revalidatePath(`/dashboard/clients/${clientId}`)
    return { success: true }
  } catch (error: any) {
    console.error('revokeClientPortalUserAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function revokeClientPortalAccessAction(clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { findProfilesByClientId } = await import('@/lib/portal-users')
    const profiles = await findProfilesByClientId(supabaseAdmin, clientId)

    for (const profile of profiles) {
      await supabaseAdmin.from('profiles').delete().eq('id', profile.id)
      await supabaseAdmin.auth.admin.deleteUser(profile.id)
    }

    // Legacy: primary auth_user_id may exist without a profile row
    if (
      check.client.auth_user_id &&
      !profiles.some((p) => p.id === check.client.auth_user_id)
    ) {
      await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', check.client.auth_user_id)
      await supabaseAdmin.auth.admin.deleteUser(check.client.auth_user_id)
    }

    await supabaseAdmin
      .from('clients')
      .update({
        auth_user_id: null,
        portal_enabled: false,
        portal_invited_at: null,
        portal_last_login_at: null,
      })
      .eq('id', clientId)

    revalidatePath(`/dashboard/clients/${clientId}`)

    return { success: true }
  } catch (error: any) {
    console.error('revokeClientPortalAccessAction error:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// Dashboard session data (bypasses client RLS)
// ============================================

export async function getDashboardUserDataAction() {
  try {
    const shell = await getDashboardShellDataAction()
    if (!shell.success) {
      return { success: false as const, error: shell.error }
    }
    return {
      success: true as const,
      profile: shell.data.profile,
      company: shell.data.company,
    }
  } catch (error: any) {
    console.error('getDashboardUserDataAction error:', error)
    return { success: false as const, error: error.message || 'Failed to load user data' }
  }
}

export const getDashboardShellDataAction = cache(async () => {
  try {
    const session = await getSessionProfile()
    if (!session) {
      return { success: false as const, error: 'Not authenticated' }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, role, company_id, crew_id')
      .eq('id', session.userId)
      .single()

    if (profileError || !profile) {
      return { success: false as const, error: 'Profile not found' }
    }

    const companyId = profile.company_id
    const isStaffWithCompany =
      companyId &&
      (profile.role === 'company_admin' || profile.role === 'team_member')

    const [companyResult, access, soloContext, platformSettings] = await Promise.all([
      companyId
        ? supabaseAdmin
            .from('companies')
            .select(
              'id, name, logo_url, promo_code, stripe_platform_subscription_id, crew_label'
            )
            .eq('id', companyId)
            .single()
        : Promise.resolve({ data: null }),
      isStaffWithCompany
        ? getCompanySubscriptionAccessForCompany(companyId)
        : Promise.resolve(null),
      isStaffWithCompany
        ? import('@/lib/solo-business-server').then((m) =>
            m.getCompanySoloContext(companyId)
          )
        : Promise.resolve(null),
      import('@/lib/platform-settings-server').then((m) => m.getPlatformSettings()),
    ])

    const company = companyResult.data

    let betaSunsetWarning = null
    if (isStaffWithCompany && company) {
      const { buildBetaSunsetWarning } = await import('@/lib/platform-release-schedule')
      betaSunsetWarning = buildBetaSunsetWarning(
        platformSettings.releaseMode,
        platformSettings.scheduledReleaseAt,
        company
      )
    }

    // P4: crew lead flag for nav + limited dispatch access
    let isCrewLead = false
    if (isStaffWithCompany && profile.role === 'team_member' && companyId) {
      const { data: leadCrew } = await supabaseAdmin
        .from('crews')
        .select('id')
        .eq('company_id', companyId)
        .eq('crew_lead_id', session.userId)
        .limit(1)
        .maybeSingle()
      isCrewLead = Boolean(leadCrew?.id)
    }

    const { normalizeCrewLabel } = await import('@/lib/crew-terminology')
    const crewLabel = normalizeCrewLabel(
      (company as { crew_label?: string | null } | null)?.crew_label
    )

    return {
      success: true as const,
      data: {
        profile,
        company,
        subscriptionAccess: access,
        betaSunsetWarning,
        isSoloBusiness: soloContext?.isSoloBusiness ?? false,
        soloCrewId: soloContext?.soloCrewId ?? null,
        role: profile.role,
        isCrewLead,
        crewLabel,
      },
    }
  } catch (error: any) {
    console.error('getDashboardShellDataAction error:', error)
    return { success: false as const, error: error.message || 'Failed to load shell data' }
  }
})

export async function getClientsListAction(options?: {
  page?: number
  pageSize?: number
  status?: 'active' | 'archived' | 'all'
}) {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false as const, error: check.error }

    const supabaseAdmin = createSupabaseAdmin()
    const page = Math.max(1, options?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? DEFAULT_CLIENTS_PAGE_SIZE))
    const status = options?.status ?? 'all'
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let clientsQuery = supabaseAdmin
      .from('clients')
      .select('*', { count: 'exact' })
      .eq('company_id', check.companyId)
      .order('created_at', { ascending: false })

    if (status !== 'all') {
      clientsQuery = clientsQuery.eq('status', status)
    }

    const { data, error, count } = await clientsQuery.range(from, to)

    if (error) {
      console.error('getClientsListAction error:', error)
      return { success: false as const, error: error.message }
    }

    const clientIds = (data || []).map((client) => client.id)
    const statsMap: Record<
      string,
      { jobsInProgress: number; nextJobDate?: string; amountDue: number }
    > = {}

    if (clientIds.length > 0) {
      const now = new Date().toISOString()
      const { data: schedules, error: schedulesError } = await supabaseAdmin
        .from('schedules')
        .select('id, client_id, status, start_time, end_time, price')
        .in('client_id', clientIds)
        .in('status', ['scheduled', 'in_progress'])

      if (schedulesError) throw schedulesError

      const scheduleIds = (schedules || []).map((schedule) => schedule.id)
      const { lineItems, payments } = await fetchBillingRowsForScheduleIds(
        supabaseAdmin,
        check.companyId,
        scheduleIds
      )

      const { computeOpenJobBalancesByClient } = await import('@/lib/billing')
      const { byClient: amountDueByClient } = computeOpenJobBalancesByClient(
        schedules || [],
        lineItems,
        payments
      )

      const { countActiveClientJobs } = await import('@/lib/client-job-stats')

      if (schedules) {
        const schedulesByClient = new Map<string, typeof schedules>()
        for (const schedule of schedules) {
          const list = schedulesByClient.get(schedule.client_id) || []
          list.push(schedule)
          schedulesByClient.set(schedule.client_id, list)
        }

        for (const [clientId, clientSchedules] of schedulesByClient.entries()) {
          if (!statsMap[clientId]) {
            statsMap[clientId] = { jobsInProgress: 0, amountDue: 0 }
          }
          statsMap[clientId].jobsInProgress = countActiveClientJobs(clientSchedules, new Date(now))

          for (const schedule of clientSchedules) {
            if (schedule.status === 'scheduled' && schedule.start_time > now) {
              if (
                !statsMap[clientId].nextJobDate ||
                schedule.start_time < statsMap[clientId].nextJobDate!
              ) {
                statsMap[clientId].nextJobDate = schedule.start_time
              }
            }
          }
        }
      }

      for (const [clientId, amountDue] of amountDueByClient.entries()) {
        if (!statsMap[clientId]) {
          statsMap[clientId] = { jobsInProgress: 0, amountDue: 0 }
        }
        statsMap[clientId].amountDue = amountDue
      }
    }

    const clients = (data || []).map((client) => ({
      ...client,
      jobsInProgress: statsMap[client.id]?.jobsInProgress ?? 0,
      nextJobDate: statsMap[client.id]?.nextJobDate,
      amountDue: statsMap[client.id]?.amountDue ?? 0,
    }))

    const total = count || 0

    return {
      success: true as const,
      data: clients,
      pagination: {
        page,
        pageSize,
        total,
        hasMore: page * pageSize < total,
      },
    }
  } catch (error: any) {
    console.error('getClientsListAction error:', error)
    return { success: false as const, error: error.message || 'Failed to load clients' }
  }
}

export async function getClientDetailAction(clientId: string) {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false as const, error: check.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('company_id', check.companyId)
      .single()

    if (clientError || !client) {
      return { success: false as const, error: 'Client not found' }
    }

    const { data: schedules, error: schedulesError } = await supabaseAdmin
      .from('schedules')
      .select(`
        *,
        crew:crews!crew_id (id, name)
      `)
      .eq('client_id', clientId)
      .order('start_time', { ascending: true })

    if (schedulesError) {
      console.error('getClientDetailAction schedules error:', schedulesError)
      return { success: false as const, error: schedulesError.message }
    }

    const { attachCrewConflictFlags } = await import('@/lib/schedule-conflicts')
    const schedulesWithConflicts = attachCrewConflictFlags(schedules || [])

    const { getCompanySoloContext } = await import('@/lib/solo-business-server')
    const soloContext = await getCompanySoloContext(check.companyId)
    const { fetchClientActivityForStaff } = await import('@/lib/staff-activity-server')
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('timezone')
      .eq('id', check.companyId)
      .single()
    const activity = await fetchClientActivityForStaff(
      supabaseAdmin,
      check.companyId,
      clientId
    )

    return {
      success: true as const,
      data: {
        client,
        schedules: schedulesWithConflicts,
        isSoloBusiness: soloContext.isSoloBusiness,
        soloCrewId: soloContext.soloCrewId,
        activity,
        timezone: company?.timezone || 'America/Chicago',
      },
    }
  } catch (error: any) {
    console.error('getClientDetailAction error:', error)
    return { success: false as const, error: error.message || 'Failed to load client' }
  }
}

export async function getJobDetailPageAction(jobId: string, clientId: string) {
  try {
    const shell = await getDashboardShellDataAction()
    if (!shell.success) {
      return { success: false as const, error: shell.error }
    }

    const companyId = shell.data.profile.company_id
    if (!companyId) {
      return { success: false as const, error: 'No company associated with this account' }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: ownedClient } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (!ownedClient) {
      return { success: false as const, error: 'Client not found' }
    }

    const [jobResult, companyResult] = await Promise.all([
      getJobAction(jobId, clientId),
      supabaseAdmin.from('companies').select('timezone').eq('id', companyId).single(),
    ])

    if (!jobResult.success || !jobResult.job) {
      return { success: false as const, error: jobResult.error || 'Job not found' }
    }

    return {
      success: true as const,
      data: {
        job: jobResult.job,
        companyTimezone: companyResult.data?.timezone || 'America/Chicago',
        userRole: shell.data.profile.role,
        isSoloBusiness: shell.data.isSoloBusiness,
        soloCrewId: shell.data.soloCrewId,
        companyId,
      },
    }
  } catch (error: any) {
    console.error('getJobDetailPageAction error:', error)
    return { success: false as const, error: error.message || 'Failed to load job' }
  }
}

export async function getCrewsPageDataAction() {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false as const, error: check.error }

    const { CREW_ASSIGNABLE_ROLES } = await import('@/lib/company-operations')
    const { getPlanEntitlements } = await import('@/lib/platform-entitlements')
    const { getCompanySoloContext } = await import('@/lib/solo-business-server')

    const supabaseAdmin = createSupabaseAdmin()
    const [soloContext, shell] = await Promise.all([
      getCompanySoloContext(check.companyId),
      getDashboardShellDataAction(),
    ])

    const entitlements =
      shell.success && shell.data.subscriptionAccess
        ? getPlanEntitlements(shell.data.subscriptionAccess.plan)
        : null

    const isCrewLead = Boolean(shell.success && shell.data.isCrewLead)
    const isTeamMemberLead =
      check.session.profile.role === 'team_member' && isCrewLead
    const isTeamMemberNonLead =
      check.session.profile.role === 'team_member' && !isCrewLead

    // Plain team members (not leads) should not manage crews
    if (isTeamMemberNonLead) {
      return {
        success: false as const,
        error: 'Only company admins or crew leads can open this page',
      }
    }

    const { normalizeCrewLabel } = await import('@/lib/crew-terminology')
    const { data: companyLabelRow } = await supabaseAdmin
      .from('companies')
      .select('crew_label')
      .eq('id', check.companyId)
      .maybeSingle()
    const crewLabel = normalizeCrewLabel(companyLabelRow?.crew_label)

    if (soloContext.isSoloBusiness) {
      return {
        success: true as const,
        data: {
          crews: [] as Array<{
            id: string
            name: string
            created_at: string
            crew_lead_id: string | null
            members: Array<{ id: string; full_name: string; avatar_url: string | null }>
          }>,
          availableMembers: [] as Array<{
            id: string
            full_name: string
            avatar_url: string | null
          }>,
          isSoloBusiness: true,
          entitlements,
          leadOnly: false,
          crewLabel,
        },
      }
    }

    // Crew leads: dispatch-only workspace (no crew CRUD / team admin)
    if (isTeamMemberLead) {
      return {
        success: true as const,
        data: {
          crews: [] as Array<{
            id: string
            name: string
            created_at: string
            crew_lead_id: string | null
            members: Array<{ id: string; full_name: string; avatar_url: string | null }>
          }>,
          availableMembers: [] as Array<{
            id: string
            full_name: string
            avatar_url: string | null
          }>,
          isSoloBusiness: false,
          entitlements,
          leadOnly: true,
          crewLabel,
        },
      }
    }

    const [{ data: crewsData }, { data: membersData }] = await Promise.all([
      supabaseAdmin
        .from('crews')
        .select(`
          *,
          profiles!crew_id (
            id,
            full_name,
            avatar_url
          )
        `)
        .eq('company_id', check.companyId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('company_id', check.companyId)
        .in('role', CREW_ASSIGNABLE_ROLES)
        .is('crew_id', null),
    ])

    const crews = (crewsData || []).map((crew: any) => ({
      id: crew.id,
      name: crew.name,
      created_at: crew.created_at,
      crew_lead_id: crew.crew_lead_id ?? null,
      members: crew.profiles || [],
    }))

    return {
      success: true as const,
      data: {
        crews,
        availableMembers: membersData || [],
        isSoloBusiness: false,
        entitlements,
        leadOnly: false,
        crewLabel,
      },
    }
  } catch (error: any) {
    console.error('getCrewsPageDataAction error:', error)
    return { success: false as const, error: error.message || 'Failed to load crews' }
  }
}

export async function getSettingsPageInitialDataAction() {
  try {
    const [shell, accountResult] = await Promise.all([
      getDashboardShellDataAction(),
      getAccountSettingsAction(),
    ])

    if (!shell.success) {
      return { success: false as const, error: shell.error }
    }
    if (!accountResult.success) {
      return { success: false as const, error: accountResult.error }
    }

    let company: {
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
      crew_label: string | null
      subscription_plan: string | null
      subscription_status: string | null
      stripe_platform_customer_id: string | null
    } | null = null

    if (
      accountResult.account.role === 'company_admin' &&
      shell.data.profile.company_id
    ) {
      const supabaseAdmin = createSupabaseAdmin()
      const { data: companyData } = await supabaseAdmin
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
          crew_label,
          subscription_plan,
          subscription_status,
          stripe_platform_customer_id
        `)
        .eq('id', shell.data.profile.company_id)
        .single()

      company = companyData
    }

    const { getPlanEntitlements } = await import('@/lib/platform-entitlements')
    const entitlements = shell.data.subscriptionAccess
      ? getPlanEntitlements(shell.data.subscriptionAccess.plan)
      : null

    return {
      success: true as const,
      data: {
        account: accountResult.account,
        company,
        entitlements,
      },
    }
  } catch (error: any) {
    console.error('getSettingsPageInitialDataAction error:', error)
    return {
      success: false as const,
      error: error.message || 'Failed to load settings',
    }
  }
}

async function verifyOwnStaffAccount() {
  const session = await getSessionProfile()
  if (!session) {
    return { ok: false as const, error: 'Not authenticated' }
  }
  if (!isStaffRole(session.profile.role)) {
    return { ok: false as const, error: 'Unauthorized' }
  }
  return {
    ok: true as const,
    session,
    userId: session.userId,
    role: session.profile.role,
  }
}

export async function getAccountSettingsAction(): Promise<
  | {
      success: true
      account: {
        fullName: string
        email: string
        avatarUrl: string | null
        role: string
      }
    }
  | { success: false; error: string }
> {
  try {
    const check = await verifyOwnStaffAccount()
    if (!check.ok) return { success: false, error: check.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('full_name, avatar_url, role, email')
      .eq('id', check.userId)
      .single()

    if (profileError || !profile) {
      return { success: false, error: 'Profile not found' }
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(check.userId)

    if (authError || !authData.user) {
      return { success: false, error: 'Account not found' }
    }

    return {
      success: true,
      account: {
        fullName: profile.full_name || '',
        email: authData.user.email || profile.email || '',
        avatarUrl: profile.avatar_url,
        role: profile.role,
      },
    }
  } catch (error: any) {
    console.error('getAccountSettingsAction error:', error)
    return { success: false, error: error.message || 'Failed to load account settings' }
  }
}

export async function updateAccountSettingsAction(data: {
  fullName: string
  email: string
  password?: string
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const check = await verifyOwnStaffAccount()
    if (!check.ok) return { success: false, error: check.error }

    const fullName = data.fullName.trim()
    const email = data.email.trim().toLowerCase()
    const password = data.password?.trim()

    if (!fullName) {
      return { success: false, error: 'Display name is required' }
    }

    if (!email || !email.includes('@')) {
      return { success: false, error: 'Enter a valid email address' }
    }

    if (password) {
      const { validatePassword } = await import('@/lib/password-policy')
      const passwordCheck = validatePassword(password)
      if (!passwordCheck.ok) {
        return {
          success: false,
          error: passwordCheck.error || 'Password does not meet requirements',
        }
      }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const existingUser = await findAuthUserByEmail(supabaseAdmin, email)
    if (existingUser && existingUser.id !== check.userId) {
      return { success: false, error: 'This email is already in use' }
    }

    const authUpdate: {
      email?: string
      password?: string
      email_confirm?: boolean
      user_metadata: { full_name: string; role: string }
    } = {
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: check.role,
      },
    }

    authUpdate.email = email
    if (password) {
      authUpdate.password = password
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      check.userId,
      authUpdate
    )

    if (authError) {
      return { success: false, error: authError.message }
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: fullName,
        email,
      })
      .eq('id', check.userId)

    if (profileError) {
      return { success: false, error: profileError.message }
    }

    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error: any) {
    console.error('updateAccountSettingsAction error:', error)
    return { success: false, error: error.message || 'Failed to update account' }
  }
}

export async function uploadAccountAvatarAction(
  formData: FormData
): Promise<
  { success: true; avatarUrl: string } | { success: false; error: string }
> {
  try {
    const check = await verifyOwnStaffAccount()
    if (!check.ok) return { success: false, error: check.error }

    const file = formData.get('file') as File | null
    if (!file || typeof file.size !== 'number' || file.size === 0) {
      return { success: false, error: 'No image file provided' }
    }

    const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!acceptedTypes.includes(file.type)) {
      return { success: false, error: 'Use a JPG, PNG, WebP, or GIF image' }
    }

    const { PROFILE_IMAGE_MAX_BYTES, PROFILE_IMAGE_MAX_SIZE_LABEL } = await import(
      '@/lib/profile-image-upload'
    )
    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      return { success: false, error: `Image must be ${PROFILE_IMAGE_MAX_SIZE_LABEL} or smaller` }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const storagePath = `${check.userId}/${Date.now()}.${fileExt}`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('user-avatars')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      return { success: false, error: uploadError.message }
    }

    const { data: publicUrl } = supabaseAdmin.storage
      .from('user-avatars')
      .getPublicUrl(uploadData.path)

    const avatarUrl = publicUrl.publicUrl

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', check.userId)

    if (profileError) {
      return { success: false, error: profileError.message }
    }

    revalidatePath('/dashboard/settings')
    return { success: true, avatarUrl }
  } catch (error: any) {
    console.error('uploadAccountAvatarAction error:', error)
    return { success: false, error: error.message || 'Failed to upload profile photo' }
  }
}

export async function removeAccountAvatarAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    const check = await verifyOwnStaffAccount()
    if (!check.ok) return { success: false, error: check.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('avatar_url')
      .eq('id', check.userId)
      .single()

    if (profileError) {
      return { success: false, error: profileError.message }
    }

    if (profile?.avatar_url) {
      const path = profile.avatar_url.split('/user-avatars/')[1]
      if (path) {
        await supabaseAdmin.storage.from('user-avatars').remove([path])
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', check.userId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error: any) {
    console.error('removeAccountAvatarAction error:', error)
    return { success: false, error: error.message || 'Failed to remove profile photo' }
  }
}

export async function getTeamMemberDashboardAction(): Promise<
  { success: true; data: TeamMemberDashboardData } | { success: false; error: string }
> {
  try {
    const session = await getSessionProfile()
    if (!session?.profile?.company_id) {
      return { success: false, error: 'Not authenticated' }
    }

    const isTeamMember = session.profile.role === 'team_member'
    const isCompanyAdmin = session.profile.role === 'company_admin'

    if (!isTeamMember && !isCompanyAdmin) {
      return { success: false, error: 'This view is for team members only' }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('crew_id')
      .eq('id', session.userId)
      .single()

    if (profileError || !profile) {
      return { success: false, error: 'Profile not found' }
    }

    const { data: companyDetails, error: companyDetailsError } = await supabaseAdmin
      .from('companies')
      .select(`
        name,
        timezone,
        is_solo_business,
        address,
        address_street,
        address_unit,
        address_city,
        address_state,
        address_zip,
        latitude,
        longitude,
        geocode_address_key
      `)
      .eq('id', session.profile.company_id)
      .single()

    if (companyDetailsError || !companyDetails) {
      return { success: false, error: 'Company not found' }
    }

    const isSoloOwner = isCompanyAdmin && Boolean(companyDetails.is_solo_business)
    if (isCompanyAdmin && !isSoloOwner) {
      return { success: false, error: 'This view is for team members only' }
    }

    const timezone = companyDetails.timezone || 'America/Chicago'
    const now = new Date()
    const dateLabel = formatCompanyDateLabel(timezone, now, 0)

    const emptyRouteData = {
      crewName: null as string | null,
      crewId: null as string | null,
      companyName: companyDetails.name || 'Company',
      dateLabel,
      jobs: [] as TeamMemberDashboardData['jobs'],
      hasCrew: false,
      route: null,
      companyLocation: null,
      invalidAddresses: [] as TeamMemberDashboardData['invalidAddresses'],
    }

    let crewId = profile.crew_id

    if (isSoloOwner && !crewId) {
      const { ensureSoloCrewForCompany, getCompanySoloContext } = await import(
        '@/lib/solo-business-server'
      )
      await ensureSoloCrewForCompany(session.profile.company_id)
      const soloContext = await getCompanySoloContext(session.profile.company_id)
      crewId = soloContext.soloCrewId
    }

    const { startIso, endIso } = getCompanyDayBounds(timezone, now, 0)
    const companyId = session.profile.company_id

    const scheduleSelect = `
      id,
      title,
      start_time,
      end_time,
      status,
      client_id,
      client:clients!client_id (
        id,
        name,
        address,
        address_street,
        address_unit,
        address_city,
        address_state,
        address_zip,
        latitude,
        longitude,
        geocode_address_key
      )
    `

    let crew: { id: string; name: string } | null = null
    let isCrewLead = false
    let crewSchedules: any[] = []

    if (crewId) {
      const { data: crewRow, error: crewError } = await supabaseAdmin
        .from('crews')
        .select('id, name, crew_lead_id')
        .eq('id', crewId)
        .eq('company_id', companyId)
        .single()

      if (!crewError && crewRow) {
        crew = { id: crewRow.id, name: crewRow.name }
        isCrewLead = crewRow.crew_lead_id === session.userId

        const { data: scheduleData, error: scheduleError } = await supabaseAdmin
          .from('schedules')
          .select(scheduleSelect)
          .eq('crew_id', crewId)
          .neq('status', 'cancelled')
          .lt('start_time', endIso)
          .gt('end_time', startIso)
          .order('start_time', { ascending: true })

        if (scheduleError) {
          return { success: false, error: scheduleError.message }
        }
        crewSchedules = scheduleData || []
      }
    }

    // P4: also surface jobs where this user is a helper (may be another crew)
    const { fetchHelperScheduleIdsForProfile, fetchHelperCountsBySchedule } =
      await import('@/app/job-helpers-actions')
    const helperIds = await fetchHelperScheduleIdsForProfile(
      supabaseAdmin,
      session.userId
    )

    let helperSchedules: any[] = []
    if (helperIds.length > 0) {
      const { data: helperData, error: helperError } = await supabaseAdmin
        .from('schedules')
        .select(scheduleSelect)
        .in('id', helperIds)
        .neq('status', 'cancelled')
        .lt('start_time', endIso)
        .gt('end_time', startIso)
        .order('start_time', { ascending: true })

      if (!helperError) {
        helperSchedules = helperData || []
      }
    }

    if (!crew && helperSchedules.length === 0) {
      return {
        success: true,
        data: emptyRouteData,
      }
    }

    const { schedules: mergedSchedules, helperOnlyIds } = mergeTeamMemberDaySchedules(
      crewSchedules,
      helperSchedules
    )

    const helperCounts = await fetchHelperCountsBySchedule(
      supabaseAdmin,
      mergedSchedules.map((s) => s.id)
    )

    const { queueCompanyScheduleStatusSync } = await import('@/lib/schedule-status-sync')
    queueCompanyScheduleStatusSync(supabaseAdmin, companyId)

    const { persistResolvedGeocodes } = await import('@/lib/address-geocoding-server')
    const jobs = buildTeamMemberJobs(mergedSchedules, timezone, now, {
      helperJobIds: helperOnlyIds,
      helperCounts,
    })

    // Route only for home-crew jobs (helpers on other crews stay list-only extras)
    const routeSchedules = crew
      ? crewSchedules
      : []
    const routeData = crew
      ? await buildTeamMemberRouteData({
          companyName: companyDetails.name || 'Company',
          companyAddress: companyDetails.address,
          companyStructuredAddress: structuredAddressFromCompany(companyDetails),
          companyCoordinates: companyDetails,
          crew,
          schedules: routeSchedules,
          onGeocodesResolved: async (resolved) => {
            await persistResolvedGeocodes(supabaseAdmin, companyId, resolved)
          },
        })
      : {
          route: null,
          companyLocation: null,
          invalidAddresses: [] as TeamMemberDashboardData['invalidAddresses'],
        }

    return {
      success: true,
      data: {
        crewName: crew?.name ?? null,
        crewId: crew?.id ?? null,
        companyName: companyDetails.name || 'Company',
        dateLabel,
        jobs,
        hasCrew: Boolean(crew) || jobs.length > 0,
        isCrewLead,
        route: routeData.route,
        companyLocation: routeData.companyLocation,
        invalidAddresses: routeData.invalidAddresses,
      },
    }
  } catch (error: any) {
    console.error('getTeamMemberDashboardAction error:', error)
    return { success: false, error: error.message || 'Failed to load team dashboard' }
  }
}

async function fetchDashboardMonthKpis(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  companyId: string,
  timezone: string,
  now: Date
): Promise<DashboardMonthlyKpis> {
  const { data: clients, error: clientsError } = await supabaseAdmin
    .from('clients')
    .select('id, name, status')
    .eq('company_id', companyId)

  if (clientsError) throw clientsError

  const clientIds = (clients || []).map((client) => client.id)

  const [billingBundle, schedules] = await Promise.all([
    fetchReportsBillingBundle({
      supabaseAdmin,
      companyId,
      clientIds,
      period: 'mtd',
      timezone,
      now,
    }),
    fetchMtdDashboardSchedules({
      supabaseAdmin,
      clientIds,
      timezone,
      now,
    }),
  ])

  const { lineItems, payments, invoiceDocuments, scheduleStatusCounts } = billingBundle

  const periodStart = getReportsPeriodStart('mtd', timezone, now)
  const periodStartIso = periodStart ? periodStart.toISOString() : null

  let leadsConverted = 0
  let estimatesSent = 0

  const leadsQuery = supabaseAdmin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .not('converted_at', 'is', null)

  if (periodStartIso) {
    leadsQuery.gte('converted_at', periodStartIso)
  }

  const { count: leadsConvertedCount, error: leadsError } = await leadsQuery
  if (leadsError && leadsError.code !== '42P01') throw leadsError
  if (!leadsError) leadsConverted = leadsConvertedCount || 0

  const estimatesQuery = supabaseAdmin
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', ['sent', 'accepted', 'declined', 'converted'])

  if (periodStartIso) {
    estimatesQuery.gte('updated_at', periodStartIso)
  }

  const { count: estimatesSentCount, error: estimatesError } = await estimatesQuery
  if (estimatesError) throw estimatesError
  estimatesSent = estimatesSentCount || 0

  const reports = buildReportsData({
    period: 'mtd',
    timezone,
    lineItems,
    payments,
    schedules: billingBundle.schedules,
    clients: clients || [],
    invoiceDocuments,
    leadsConverted,
    estimatesSent,
    scheduleStatusCounts,
    now,
  })

  let recurringSeries: import('@/lib/schedule-calendar').RecurringSeriesAnchor[] = []

  if (clientIds.length > 0) {
    const recurringAnchors = schedules.filter(
      (schedule) =>
        !!schedule.recurring_rule_id &&
        ['scheduled', 'in_progress'].includes(schedule.status)
    )
    const recurringRuleIds = [
      ...new Set(
        recurringAnchors
          .map((schedule) => schedule.recurring_rule_id)
          .filter((ruleId): ruleId is string => !!ruleId)
      ),
    ]

    if (recurringRuleIds.length > 0) {
      const { data: rulesData, error: rulesError } = await supabaseAdmin
        .from('recurring_rules')
        .select('id, frequency, interval')
        .in('id', recurringRuleIds)

      if (rulesError) throw rulesError

      const { selectRecurringSeriesAnchors } = await import('@/lib/schedule-calendar')
      const rulesById = new Map(
        (rulesData || []).map((rule) => [
          rule.id,
          {
            id: rule.id,
            frequency: rule.frequency as 'daily' | 'weekly' | 'monthly',
            interval: rule.interval,
          },
        ])
      )

      recurringSeries = selectRecurringSeriesAnchors(
        recurringAnchors.map((schedule) => ({
          id: schedule.id,
          title: schedule.title,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          status: schedule.status,
          client_id: schedule.client_id,
          crew_id: null,
          recurring_rule_id: schedule.recurring_rule_id,
          occurrence_origin_start: schedule.occurrence_origin_start,
          client: null,
          crew: null,
        })),
        rulesById
      )
    }
  }

  const mtdJobCounts = countMtdJobOccurrences({
    schedules,
    recurringSeries,
    timezone,
    now,
  })

  const stripeStatus = await getCompanyStripeStatus(companyId)
  const mtdBounds = getReportsPeriodBounds('mtd', timezone, now)
  const recordedAllPayments = sumRecordedPaymentsInPeriod(payments, timezone, now)
  const recordedStripePayments = sumRecordedStripePaymentsInPeriod(payments, timezone, now)
  const collected = await resolveMonthCollectedAmount({
    companyId,
    stripeAccountId: stripeStatus.stripeAccountId,
    billingEnabled: stripeStatus.billingEnabled,
    bounds: {
      start: mtdBounds.start ?? new Date(0),
      end: mtdBounds.end,
    },
    recordedAllPayments,
    recordedStripePayments,
  })

  return {
    monthLabel: new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'long',
      year: 'numeric',
    }).format(now),
    totalBilled: reports.summary.totalBilled,
    totalCollected: collected.amount,
    collectedSource: collected.source,
    balanceDue: reports.summary.balanceDue,
    jobsCompleted: mtdJobCounts.completed,
    jobsScheduled: mtdJobCounts.open,
    activeClients: reports.summary.activeClients,
    leadsConverted: reports.summary.leadsConverted,
    estimatesSent: reports.summary.estimatesSent,
  }
}

export async function getDashboardOverviewAction(): Promise<
  { success: true; data: DashboardOverviewData } | { success: false; error: string }
> {
  try {
    const session = await getSessionProfile()
    if (!session?.profile?.company_id) {
      return { success: false, error: 'Not authenticated' }
    }

    const companyId = session.profile.company_id
    const supabaseAdmin = createSupabaseAdmin()
    const { queueCompanyScheduleStatusSync } = await import('@/lib/schedule-status-sync')
    queueCompanyScheduleStatusSync(supabaseAdmin, companyId)

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select(
        'timezone, business_hours_start, business_hours_end, business_open_weekdays, is_solo_business, crew_label'
      )
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Company not found' }
    }

    const { normalizeCrewLabel } = await import('@/lib/crew-terminology')
    const crewLabel = normalizeCrewLabel(
      (company as { crew_label?: string | null }).crew_label
    )
    const timezone = company.timezone || 'America/Chicago'
    const businessHours = normalizeBusinessHours(
      company.business_hours_start,
      company.business_hours_end,
      company.business_open_weekdays
    )
    const now = new Date()
    const closedDayToday = isClosedDayToday(timezone, businessHours, now)
    const { fetchCompanyActivity } = await import('@/lib/staff-activity-server')
    const activity = await fetchCompanyActivity(supabaseAdmin, companyId, now)

    if (closedDayToday) {
      const { getCompanySoloContext } = await import('@/lib/solo-business-server')
      const soloContext = await getCompanySoloContext(companyId)
      const todayStr = formatCompanyDateLabel(timezone, now, 0)
      const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
      }).format(now)
      const monthlyKpis = await fetchDashboardMonthKpis(
        supabaseAdmin,
        companyId,
        timezone,
        now
      )

      return {
        success: true,
        data: {
          timezone,
          businessHours,
          dashboardMode: 'closed_day',
          crews: [],
          jobs: [],
          laneCount: 1,
          timelineMode: 'today',
          timelineDateLabel: todayStr,
          closedDayLabel: weekday,
          monthlyKpis,
          isSoloBusiness: soloContext.isSoloBusiness,
          crewLabel,
          activity,
        },
      }
    }

    const showTomorrow = shouldShowTomorrowTimeline(timezone, businessHours, now)
    const timelineMode = showTomorrow ? 'tomorrow' : 'today'
    const timelineDayOffset = showTomorrow ? 1 : 0

    const { startIso: todayStartIso, endIso: todayEndIso } = getCompanyDayBounds(timezone, now, 0)
    const { startIso: timelineStartIso, endIso: timelineEndIso } = getCompanyDayBounds(
      timezone,
      now,
      timelineDayOffset
    )

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('company_id', companyId)

    const clientIds = clients?.map((client) => client.id) || []

    const scheduleSelect = `
      id,
      title,
      start_time,
      end_time,
      status,
      client_id,
      crew_id,
      client:clients!client_id (name, address),
      crew:crews!crew_id (id, name)
    `

    const fetchSchedulesForDay = async (startIso: string, endIso: string) => {
      if (clientIds.length === 0) return []

      const { data: scheduleData, error: scheduleError } = await supabaseAdmin
        .from('schedules')
        .select(scheduleSelect)
        .in('client_id', clientIds)
        .neq('status', 'cancelled')
        .lt('start_time', endIso)
        .gt('end_time', startIso)
        .order('start_time', { ascending: true })

      if (scheduleError) {
        throw new Error(scheduleError.message)
      }

      return scheduleData || []
    }

    let todaySchedules: any[] = []
    let timelineSchedules: any[] = []

    try {
      todaySchedules = await fetchSchedulesForDay(todayStartIso, todayEndIso)
      if (timelineMode === 'tomorrow') {
        timelineSchedules = await fetchSchedulesForDay(timelineStartIso, timelineEndIso)
      } else {
        timelineSchedules = todaySchedules
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to load schedules' }
    }

    const { data: crewsData, error: crewsError } = await supabaseAdmin
      .from('crews')
      .select(`
        id,
        name,
        profiles!crew_id (id, full_name)
      `)
      .eq('company_id', companyId)
      .order('name', { ascending: true })

    if (crewsError) {
      return { success: false, error: crewsError.message }
    }

    const { getCompanySoloContext } = await import('@/lib/solo-business-server')
    const soloContext = await getCompanySoloContext(companyId)
    const filteredCrewsData =
      soloContext.isSoloBusiness && soloContext.soloCrewId
        ? (crewsData || []).filter((crew) => crew.id === soloContext.soloCrewId)
        : crewsData || []

    const timelineJobs = assignTimelineLanes(buildTimelineJobs(timelineSchedules, timezone, now))
    const crews = buildCrewSummaries(filteredCrewsData, todaySchedules, timezone, now)
    const laneCount = timelineJobs.reduce((max, job) => Math.max(max, job.lane + 1), 1)

    return {
      success: true,
      data: {
        timezone,
        businessHours,
        dashboardMode: 'live',
        crews,
        jobs: timelineJobs,
        laneCount,
        timelineMode,
        timelineDateLabel: formatCompanyDateLabel(timezone, now, timelineDayOffset),
        isSoloBusiness: soloContext.isSoloBusiness,
        crewLabel,
        activity,
      },
    }
  } catch (error: any) {
    console.error('getDashboardOverviewAction error:', error)
    return { success: false, error: error.message || 'Failed to load dashboard' }
  }
}

export async function getDashboardMapDataAction(): Promise<
  { success: true; data: DashboardMapData } | { success: false; error: string }
> {
  try {
    const session = await getSessionProfile()
    if (!session?.profile?.company_id) {
      return { success: false, error: 'Not authenticated' }
    }

    const companyId = session.profile.company_id
    const supabaseAdmin = createSupabaseAdmin()
    const now = new Date()
    const timezone = 'America/Chicago'

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select(`
        name,
        address,
        timezone,
        business_hours_start,
        business_hours_end,
        business_open_weekdays,
        address_street,
        address_unit,
        address_city,
        address_state,
        address_zip,
        latitude,
        longitude,
        geocode_address_key
      `)
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Company not found' }
    }

    const { persistResolvedGeocodes } = await import('@/lib/address-geocoding-server')
    const companyTimezone = company.timezone || timezone
    const businessHours = normalizeBusinessHours(
      company.business_hours_start,
      company.business_hours_end,
      company.business_open_weekdays
    )
    const closedDayToday = isClosedDayToday(companyTimezone, businessHours, now)

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('company_id', companyId)

    const clientIds = clients?.map((client) => client.id) || []
    let schedules: any[] = []
    let mapMode: 'today' | 'upcoming_open_days' = 'today'
    let previewRangeLabel: string | undefined

    const scheduleSelect = `
      id,
      title,
      start_time,
      end_time,
      status,
      crew_id,
      client:clients!client_id (
        id,
        name,
        address,
        address_street,
        address_unit,
        address_city,
        address_state,
        address_zip,
        latitude,
        longitude,
        geocode_address_key
      ),
      crew:crews!crew_id (id, name)
    `

    if (clientIds.length > 0) {
      if (closedDayToday) {
        const upcomingOpenDays = getNextOpenDayDates(
          companyTimezone,
          businessHours.openWeekdays,
          UPCOMING_OPEN_DAYS_PREVIEW_COUNT,
          now
        )
        previewRangeLabel = formatUpcomingOpenDaysRangeLabel(upcomingOpenDays)
        mapMode = 'upcoming_open_days'

        if (upcomingOpenDays.length > 0) {
          const rangeStartIso = getCompanyDayBounds(
            companyTimezone,
            now,
            upcomingOpenDays[0].dayOffset
          ).startIso
          const rangeEndIso = getCompanyDayBounds(
            companyTimezone,
            now,
            upcomingOpenDays[upcomingOpenDays.length - 1].dayOffset
          ).endIso

          const { data: scheduleData, error: scheduleError } = await supabaseAdmin
            .from('schedules')
            .select(scheduleSelect)
            .in('client_id', clientIds)
            .neq('status', 'cancelled')
            .lt('start_time', rangeEndIso)
            .gt('end_time', rangeStartIso)

          if (scheduleError) {
            return { success: false, error: scheduleError.message }
          }
          schedules = scheduleData || []
        }
      } else {
        const { startIso: todayStartIso, endIso: todayEndIso } = getCompanyDayBounds(
          companyTimezone,
          now,
          0
        )

        const { data: scheduleData, error: scheduleError } = await supabaseAdmin
          .from('schedules')
          .select(scheduleSelect)
          .in('client_id', clientIds)
          .neq('status', 'cancelled')
          .lt('start_time', todayEndIso)
          .gt('end_time', todayStartIso)

        if (scheduleError) {
          return { success: false, error: scheduleError.message }
        }
        schedules = scheduleData || []
      }
    }

    const companyStructuredAddress = structuredAddressFromCompanyRow(company)

    const mapData = await buildDashboardMapData({
      companyName: company.name,
      companyAddress: company.address,
      companyStructuredAddress,
      companyCoordinates: company,
      schedules,
      timezone: companyTimezone,
      now,
      mode: mapMode,
      previewRangeLabel,
      onGeocodesResolved: async (resolved) => {
        await persistResolvedGeocodes(supabaseAdmin, companyId, resolved)
      },
    })

    return { success: true, data: mapData }
  } catch (error: any) {
    console.error('getDashboardMapDataAction error:', error)
    return { success: false, error: error.message || 'Failed to load map data' }
  }
}

export async function getScheduleCalendarAction(weekOffset = 0): Promise<
  | { success: true; data: import('@/lib/schedule-calendar').ScheduleCalendarData }
  | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }

    const companyId = check.companyId
    const supabaseAdmin = createSupabaseAdmin()
    const { queueCompanyScheduleStatusSync } = await import('@/lib/schedule-status-sync')
    queueCompanyScheduleStatusSync(supabaseAdmin, companyId)

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('timezone, business_hours_start, business_hours_end, business_open_weekdays')
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Company not found' }
    }

    const timezone = company.timezone || 'America/Chicago'
    const businessHours = normalizeBusinessHours(
      company.business_hours_start,
      company.business_hours_end,
      company.business_open_weekdays
    )

    const { getCompanyWeekDayBounds, buildScheduleCalendarData } = await import(
      '@/lib/schedule-calendar'
    )
    const week = getCompanyWeekDayBounds(timezone, new Date(), weekOffset)

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('company_id', companyId)

    const clientIds = clients?.map((client) => client.id) || []
    let schedules: any[] = []

    if (clientIds.length > 0) {
      const scheduleSelect = `
          id,
          title,
          start_time,
          end_time,
          status,
          client_id,
          crew_id,
          recurring_rule_id,
          occurrence_origin_start,
          client:clients!client_id (name, address),
          crew:crews!crew_id (id, name)
        `

      const { data: scheduleData, error: scheduleError } = await supabaseAdmin
        .from('schedules')
        .select(scheduleSelect)
        .in('client_id', clientIds)
        .neq('status', 'cancelled')
        .lt('start_time', week.weekEndIso)
        .gt('end_time', week.weekStartIso)
        .order('start_time', { ascending: true })

      if (scheduleError) {
        return { success: false, error: scheduleError.message }
      }

      schedules = scheduleData || []
    }

    const { data: crewsData, error: crewsError } = await supabaseAdmin
      .from('crews')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name', { ascending: true })

    if (crewsError) {
      return { success: false, error: crewsError.message }
    }

    let recurringSeries: import('@/lib/schedule-calendar').RecurringSeriesAnchor[] = []

    if (clientIds.length > 0) {
      const { data: recurringAnchors, error: anchorError } = await supabaseAdmin
        .from('schedules')
        .select(`
          id,
          title,
          start_time,
          end_time,
          status,
          client_id,
          crew_id,
          recurring_rule_id,
          occurrence_origin_start,
          client:clients!client_id (name, address),
          crew:crews!crew_id (id, name)
        `)
        .in('client_id', clientIds)
        .not('recurring_rule_id', 'is', null)
        .in('status', ['scheduled', 'in_progress'])
        .order('start_time', { ascending: true })

      if (anchorError) {
        return { success: false, error: anchorError.message }
      }

      const recurringRuleIds = [
        ...new Set(
          (recurringAnchors || [])
            .map((schedule) => schedule.recurring_rule_id)
            .filter((ruleId): ruleId is string => !!ruleId)
        ),
      ]

      if (recurringRuleIds.length > 0) {
        const { data: rulesData, error: rulesError } = await supabaseAdmin
          .from('recurring_rules')
          .select('id, frequency, interval')
          .in('id', recurringRuleIds)

        if (rulesError) {
          return { success: false, error: rulesError.message }
        }

        const { selectRecurringSeriesAnchors } = await import('@/lib/schedule-calendar')
        const rulesById = new Map(
          (rulesData || []).map((rule) => [
            rule.id,
            {
              id: rule.id,
              frequency: rule.frequency as 'daily' | 'weekly' | 'monthly',
              interval: rule.interval,
            },
          ])
        )

        recurringSeries = selectRecurringSeriesAnchors(recurringAnchors || [], rulesById)
      }
    }

    return {
      success: true,
      data: buildScheduleCalendarData({
        companyId,
        timezone,
        businessHours,
        weekOffset,
        crews: crewsData || [],
        schedules,
        recurringSeries,
      }),
    }
  } catch (error: any) {
    console.error('getScheduleCalendarAction error:', error)
    return { success: false, error: error.message || 'Failed to load schedule calendar' }
  }
}

export async function rescheduleScheduleCalendarJobAction(data: {
  companyId: string
  clientId: string
  scope: 'instance' | 'series'
  newStartTime: string
  newEndTime: string
  jobId: string
  isProjected?: boolean
  recurringRuleId?: string | null
  anchorJobId?: string | null
  occurrenceStart?: string
}) {
  const check = await verifyCompanyStaff()
  if (!check.ok) return { success: false, error: check.error }
  if (check.companyId !== data.companyId) {
    return { success: false, error: 'Unauthorized' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    if (!data.recurringRuleId) {
      return updateJobAction({
        jobId: data.jobId,
        clientId: data.clientId,
        companyId: data.companyId,
        startTime: data.newStartTime,
        endTime: data.newEndTime,
      })
    }

    const anchorJobId = data.anchorJobId || data.jobId
    const occurrenceStart = data.occurrenceStart || data.newStartTime

    const { data: anchor, error: anchorError } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .eq('id', anchorJobId)
      .eq('client_id', data.clientId)
      .single()

    if (anchorError || !anchor) {
      return { success: false, error: 'Recurring series anchor not found' }
    }

    if (data.scope === 'instance') {
      if (data.isProjected) {
        const { data: created, error: createError } = await supabaseAdmin
          .from('schedules')
          .insert({
            client_id: anchor.client_id,
            crew_id: anchor.crew_id,
            recurring_rule_id: data.recurringRuleId,
            title: anchor.title,
            description: anchor.description,
            start_time: data.newStartTime,
            end_time: data.newEndTime,
            occurrence_origin_start: occurrenceStart,
            status: 'scheduled',
            price: anchor.price || 0,
          })
          .select('id')
          .single()

        if (createError || !created) {
          return { success: false, error: createError?.message || 'Could not create visit' }
        }

        const { data: client } = await supabaseAdmin
          .from('clients')
          .select('company_id')
          .eq('id', data.clientId)
          .single()

        if (client?.company_id) {
          await duplicateBillingToSchedule(
            supabaseAdmin,
            anchor.id,
            created.id,
            data.clientId,
            client.company_id,
            {
              title: anchor.title,
              price: anchor.price || 0,
            }
          )
        }

        revalidatePath(`/dashboard/clients/${data.clientId}`)
        revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${created.id}`)
        revalidatePath('/dashboard/schedule')

        const { queueGoogleCalendarSync } = await import('@/lib/google-calendar-sync')
        await queueGoogleCalendarSync(supabaseAdmin, created.id)

        return { success: true, jobId: created.id }
      }

      return updateJobAction({
        jobId: data.jobId,
        clientId: data.clientId,
        companyId: data.companyId,
        startTime: data.newStartTime,
        endTime: data.newEndTime,
      })
    }

    const deltaMs =
      new Date(data.newStartTime).getTime() - new Date(occurrenceStart).getTime()
    const shiftedStart = new Date(new Date(anchor.start_time).getTime() + deltaMs).toISOString()
    const shiftedEnd = new Date(new Date(anchor.end_time).getTime() + deltaMs).toISOString()

    return updateJobAction({
      jobId: anchor.id,
      clientId: data.clientId,
      companyId: data.companyId,
      startTime: shiftedStart,
      endTime: shiftedEnd,
    })
  } catch (error: any) {
    console.error('rescheduleScheduleCalendarJobAction error:', error)
    return { success: false, error: error.message || 'Could not reschedule job' }
  }
}

export async function getRoutePlannerDataAction(): Promise<
  { success: true; data: RoutePlannerData } | { success: false; error: string }
> {
  try {
    const session = await getSessionProfile()
    if (!session?.profile?.company_id) {
      return { success: false, error: 'Not authenticated' }
    }

    const companyId = session.profile.company_id
    const { assertCompanyPlatformFeature } = await import(
      '@/lib/platform-entitlements-server'
    )
    const featureGate = await assertCompanyPlatformFeature(companyId, 'routes')
    if (!featureGate.ok) return { success: false, error: featureGate.error }
    const supabaseAdmin = createSupabaseAdmin()
    const now = new Date()

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select(`
        name,
        address,
        timezone,
        address_street,
        address_unit,
        address_city,
        address_state,
        address_zip,
        latitude,
        longitude,
        geocode_address_key
      `)
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Company not found' }
    }

    const { persistResolvedGeocodes } = await import('@/lib/address-geocoding-server')
    const companyTimezone = company.timezone || 'America/Chicago'
    const { startIso: todayStartIso, endIso: todayEndIso } = getCompanyDayBounds(
      companyTimezone,
      now,
      0
    )

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('company_id', companyId)

    const clientIds = clients?.map((client) => client.id) || []
    let todaySchedules: any[] = []

    if (clientIds.length > 0) {
      const { data: scheduleData, error: scheduleError } = await supabaseAdmin
        .from('schedules')
        .select(`
          id,
          title,
          start_time,
          end_time,
          status,
          crew_id,
          client:clients!client_id (
            id,
            name,
            address,
            address_street,
            address_unit,
            address_city,
            address_state,
            address_zip,
            latitude,
            longitude,
            geocode_address_key
          ),
          crew:crews!crew_id (id, name)
        `)
        .in('client_id', clientIds)
        .neq('status', 'cancelled')
        .not('crew_id', 'is', null)
        .lt('start_time', todayEndIso)
        .gt('end_time', todayStartIso)

      if (scheduleError) {
        return { success: false, error: scheduleError.message }
      }
      todaySchedules = scheduleData || []
    }

    const { data: crewsData, error: crewsError } = await supabaseAdmin
      .from('crews')
      .select('id, name')
      .eq('company_id', companyId)

    if (crewsError) {
      return { success: false, error: crewsError.message }
    }

    const companyStructuredAddress = structuredAddressFromCompanyRow(company)

    const routeData = await buildRoutePlannerData({
      companyName: company.name,
      companyAddress: company.address,
      companyStructuredAddress,
      companyCoordinates: company,
      crews: crewsData || [],
      schedules: todaySchedules,
      onGeocodesResolved: async (resolved) => {
        await persistResolvedGeocodes(supabaseAdmin, companyId, resolved)
      },
    })

    routeData.dateLabel = formatCompanyDateLabel(companyTimezone, now, 0)

    return { success: true, data: routeData }
  } catch (error: any) {
    console.error('getRoutePlannerDataAction error:', error)
    return { success: false, error: error.message || 'Failed to load route planner' }
  }
}

export async function updateUserThemeAction(theme: ThemePreference) {
  try {
    const session = await getSessionProfile()
    if (!session) {
      return { success: false as const, error: 'Not authenticated' }
    }

    if (!isThemePreference(theme)) {
      return { success: false as const, error: 'Invalid theme preference' }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ theme_preference: theme })
      .eq('id', session.userId)

    if (error) {
      return { success: false as const, error: error.message }
    }

    const cookieStore = await cookies()
    cookieStore.set(THEME_COOKIE_NAME, theme, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })

    return { success: true as const }
  } catch (error: any) {
    console.error('updateUserThemeAction error:', error)
    return { success: false as const, error: error.message || 'Failed to save theme' }
  }
}

async function verifyCompanyPersonalizationEditor() {
  const session = await getSessionProfile()
  if (!session) {
    return { ok: false as const, error: 'Not authenticated' }
  }
  if (session.profile.role !== 'company_admin' || !session.profile.company_id) {
    return {
      ok: false as const,
      error: 'Only company admins can update company appearance settings',
    }
  }
  return { ok: true as const, companyId: session.profile.company_id, session }
}

function revalidateCompanyPersonalizationPaths() {
  revalidatePath('/dashboard', 'layout')
  revalidatePath('/portal', 'layout')
  revalidatePath('/onboarding')
  revalidatePath('/dashboard/settings')
  revalidatePath('/portal/settings')
}

export async function refreshBackgroundImageUrlAction(): Promise<
  { success: true; backgroundUrl: string } | { success: false; error: string }
> {
  try {
    const session = await getSessionProfile()
    if (!session) return { success: false, error: 'Not authenticated' }

    const { getPersonalizationCompanyId, resolveBackgroundDisplayUrl } = await import(
      '@/lib/personalization-server'
    )
    const companyId = await getPersonalizationCompanyId(session)
    if (!companyId) {
      return { success: false, error: 'No company appearance settings found' }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('background_image_url')
      .eq('id', companyId)
      .single()

    if (companyError) {
      return { success: false, error: companyError.message }
    }

    const reference = company?.background_image_url
    if (!reference?.trim()) {
      return { success: false, error: 'No background image saved' }
    }

    const backgroundUrl = await resolveBackgroundDisplayUrl(reference)
    if (!backgroundUrl) {
      return { success: false, error: 'Could not load background image' }
    }

    return { success: true, backgroundUrl }
  } catch (error: any) {
    console.error('refreshBackgroundImageUrlAction error:', error)
    return { success: false, error: error.message || 'Failed to refresh background image' }
  }
}

export async function updateAccentColorAction(accentColor: string | null) {
  try {
    const check = await verifyCompanyPersonalizationEditor()
    if (!check.ok) return { success: false as const, error: check.error }

    const { normalizeHexColor } = await import('@/lib/personalization')
    const normalized = accentColor ? normalizeHexColor(accentColor) : null
    if (accentColor && !normalized) {
      return { success: false as const, error: 'Enter a valid hex color like #2563eb' }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('companies')
      .update({ accent_color: normalized })
      .eq('id', check.companyId)

    if (error) {
      if (error.code === '42703') {
        return { success: false as const, error: 'Run supabase/personalization-schema.sql first.' }
      }
      return { success: false as const, error: error.message }
    }

    revalidateCompanyPersonalizationPaths()

    return { success: true as const, accentColor: normalized }
  } catch (error: any) {
    console.error('updateAccentColorAction error:', error)
    return { success: false as const, error: error.message || 'Failed to save accent color' }
  }
}

/**
 * Persist company surface colors (card, text, solid background).
 * Pass only fields that should change; null clears that field.
 */
export async function updateCompanySurfaceColorsAction(input: {
  cardColor?: string | null
  textColor?: string | null
  backgroundColor?: string | null
}) {
  try {
    const check = await verifyCompanyPersonalizationEditor()
    if (!check.ok) return { success: false as const, error: check.error }

    const { normalizeHexColor } = await import('@/lib/personalization')
    const { PERSONALIZATION_BACKGROUND_BUCKET } = await import(
      '@/lib/personalization-server'
    )
    const supabaseAdmin = createSupabaseAdmin()

    const update: Record<string, string | null> = {}

    if (input.cardColor !== undefined) {
      const normalized = input.cardColor ? normalizeHexColor(input.cardColor) : null
      if (input.cardColor && !normalized) {
        return { success: false as const, error: 'Invalid card color' }
      }
      update.card_color = normalized
    }

    if (input.textColor !== undefined) {
      const normalized = input.textColor ? normalizeHexColor(input.textColor) : null
      if (input.textColor && !normalized) {
        return { success: false as const, error: 'Invalid text color' }
      }
      update.text_color = normalized
    }

    if (input.backgroundColor !== undefined) {
      const normalized = input.backgroundColor
        ? normalizeHexColor(input.backgroundColor)
        : null
      if (input.backgroundColor && !normalized) {
        return { success: false as const, error: 'Invalid background color' }
      }
      update.background_color = normalized

      // Solid color mode replaces wallpaper
      if (normalized) {
        const { data: company } = await supabaseAdmin
          .from('companies')
          .select('background_image_url')
          .eq('id', check.companyId)
          .single()

        const reference = company?.background_image_url
        if (reference) {
          const storagePath = reference.includes(`/${PERSONALIZATION_BACKGROUND_BUCKET}/`)
            ? reference.split(`/${PERSONALIZATION_BACKGROUND_BUCKET}/`)[1]?.split('?')[0]
            : reference.startsWith('http')
              ? null
              : reference
          if (storagePath) {
            await supabaseAdmin.storage
              .from(PERSONALIZATION_BACKGROUND_BUCKET)
              .remove([storagePath])
          }
        }
        update.background_image_url = null
      }
    }

    if (Object.keys(update).length === 0) {
      return { success: false as const, error: 'No appearance fields to update' }
    }

    const { error } = await supabaseAdmin
      .from('companies')
      .update(update)
      .eq('id', check.companyId)

    if (error) {
      if (error.code === '42703') {
        return {
          success: false as const,
          error: 'Run supabase/personalization-schema.sql first.',
        }
      }
      return { success: false as const, error: error.message }
    }

    revalidateCompanyPersonalizationPaths()

    return {
      success: true as const,
      cardColor:
        input.cardColor !== undefined
          ? input.cardColor
            ? normalizeHexColor(input.cardColor)
            : null
          : undefined,
      textColor:
        input.textColor !== undefined
          ? input.textColor
            ? normalizeHexColor(input.textColor)
            : null
          : undefined,
      backgroundColor:
        input.backgroundColor !== undefined
          ? input.backgroundColor
            ? normalizeHexColor(input.backgroundColor)
            : null
          : undefined,
    }
  } catch (error: any) {
    console.error('updateCompanySurfaceColorsAction error:', error)
    return {
      success: false as const,
      error: error.message || 'Failed to save appearance colors',
    }
  }
}

export async function uploadBackgroundImageAction(
  formData: FormData
): Promise<
  { success: true; backgroundUrl: string } | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyPersonalizationEditor()
    if (!check.ok) return { success: false, error: check.error }

    const file = formData.get('file') as File | null
    if (!file || typeof file.size !== 'number' || file.size === 0) {
      return { success: false, error: 'No image file provided' }
    }

    const { PROFILE_IMAGE_ACCEPTED_TYPES, PROFILE_IMAGE_MAX_BYTES, PROFILE_IMAGE_MAX_SIZE_LABEL } =
      await import('@/lib/profile-image-upload')
    const { PERSONALIZATION_BACKGROUND_BUCKET } = await import('@/lib/personalization-server')

    if (!PROFILE_IMAGE_ACCEPTED_TYPES.includes(file.type as (typeof PROFILE_IMAGE_ACCEPTED_TYPES)[number])) {
      return { success: false, error: 'Use a JPG, PNG, WebP, or GIF image' }
    }

    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      return { success: false, error: `Image must be ${PROFILE_IMAGE_MAX_SIZE_LABEL} or smaller` }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const storagePath = `${check.companyId}/background/${Date.now()}.${fileExt}`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(PERSONALIZATION_BACKGROUND_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      return { success: false, error: uploadError.message }
    }

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('background_image_url')
      .eq('id', check.companyId)
      .single()

    const previousPath = company?.background_image_url?.includes(`/${PERSONALIZATION_BACKGROUND_BUCKET}/`)
      ? company.background_image_url.split(`/${PERSONALIZATION_BACKGROUND_BUCKET}/`)[1]?.split('?')[0]
      : company?.background_image_url?.startsWith('http')
        ? null
        : company?.background_image_url

    if (previousPath && previousPath !== uploadData.path) {
      await supabaseAdmin.storage.from(PERSONALIZATION_BACKGROUND_BUCKET).remove([previousPath])
    }

    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update({
        background_image_url: uploadData.path,
        // Image mode replaces solid color
        background_color: null,
      })
      .eq('id', check.companyId)

    if (updateError) {
      if (updateError.code === '42703') {
        return { success: false, error: 'Run supabase/personalization-schema.sql first.' }
      }
      return { success: false, error: updateError.message }
    }

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(PERSONALIZATION_BACKGROUND_BUCKET)
      .createSignedUrl(uploadData.path, 60 * 60 * 24 * 7)

    if (signedError || !signed?.signedUrl) {
      return { success: false, error: signedError?.message || 'Uploaded but could not be displayed' }
    }

    revalidateCompanyPersonalizationPaths()

    return { success: true, backgroundUrl: signed.signedUrl }
  } catch (error: any) {
    console.error('uploadBackgroundImageAction error:', error)
    return { success: false, error: error.message || 'Failed to upload background image' }
  }
}

export async function removeBackgroundImageAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyPersonalizationEditor()
    if (!check.ok) return { success: false, error: check.error }

    const { PERSONALIZATION_BACKGROUND_BUCKET } = await import('@/lib/personalization-server')
    const supabaseAdmin = createSupabaseAdmin()
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('background_image_url')
      .eq('id', check.companyId)
      .single()

    if (companyError) {
      return { success: false, error: companyError.message }
    }

    const reference = company?.background_image_url
    if (reference) {
      const storagePath = reference.includes(`/${PERSONALIZATION_BACKGROUND_BUCKET}/`)
        ? reference.split(`/${PERSONALIZATION_BACKGROUND_BUCKET}/`)[1]?.split('?')[0]
        : reference.startsWith('http')
          ? null
          : reference

      if (storagePath) {
        await supabaseAdmin.storage.from(PERSONALIZATION_BACKGROUND_BUCKET).remove([storagePath])
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update({ background_image_url: null })
      .eq('id', check.companyId)

    if (updateError) {
      if (updateError.code === '42703') {
        return { success: false, error: 'Run supabase/personalization-schema.sql first.' }
      }
      return { success: false, error: updateError.message }
    }

    revalidateCompanyPersonalizationPaths()

    return { success: true }
  } catch (error: any) {
    console.error('removeBackgroundImageAction error:', error)
    return { success: false, error: error.message || 'Failed to remove background image' }
  }
}

export async function getCompanyLogoDisplayUrlAction(
  logoRef: string | null | undefined
): Promise<{ success: true; url: string | null } | { success: false; error: string }> {
  try {
    const session = await getSessionProfile()
    if (!session) {
      return { success: false, error: 'Not authenticated' }
    }

    const { getCompanyLogoStoragePath } = await import('@/lib/company-logo')
    const storagePath = getCompanyLogoStoragePath(logoRef)

    if (!storagePath) {
      return { success: true, url: null }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { data, error } = await supabaseAdmin.storage
      .from('company-logos')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7)

    if (error || !data?.signedUrl) {
      if (logoRef?.startsWith('http')) {
        return { success: true, url: logoRef }
      }
      return { success: false, error: error?.message || 'Could not load logo' }
    }

    return { success: true, url: data.signedUrl }
  } catch (error: any) {
    console.error('getCompanyLogoDisplayUrlAction error:', error)
    return { success: false, error: error.message || 'Could not load logo' }
  }
}

export async function uploadCompanyLogoAction(
  formData: FormData | null
): Promise<
  | { success: true; logoUrl: string | null; logoPath?: string | null }
  | { success: false; error: string }
> {
  try {
    const session = await getSessionProfile()
    if (!session?.profile?.company_id) {
      return { success: false, error: 'Not authenticated' }
    }

    const companyId = session.profile.company_id
    const supabaseAdmin = createSupabaseAdmin()

    if (!formData) {
      const { error } = await supabaseAdmin
        .from('companies')
        .update({ logo_url: null })
        .eq('id', companyId)

      if (error) return { success: false, error: error.message }

      revalidatePath('/dashboard/settings')
      return { success: true, logoUrl: null }
    }

    const file = formData.get('file') as File | null
    if (!file || typeof file.size !== 'number' || file.size === 0) {
      return { success: false, error: 'No image file provided' }
    }

    const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!acceptedTypes.includes(file.type)) {
      return { success: false, error: 'Use a JPG, PNG, WebP, or GIF image' }
    }

    const { PROFILE_IMAGE_MAX_BYTES, PROFILE_IMAGE_MAX_SIZE_LABEL } = await import(
      '@/lib/profile-image-upload'
    )
    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      return { success: false, error: `Image must be ${PROFILE_IMAGE_MAX_SIZE_LABEL} or smaller` }
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png'
    const fileName = `${companyId}/${Date.now()}.${fileExt}`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('company-logos')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      return { success: false, error: uploadError.message }
    }

    const logoPath = uploadData.path

    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update({ logo_url: logoPath })
      .eq('id', companyId)

    if (updateError) {
      return { success: false, error: updateError.message }
    }

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from('company-logos')
      .createSignedUrl(logoPath, 60 * 60 * 24 * 7)

    if (signedError || !signed?.signedUrl) {
      return { success: false, error: signedError?.message || 'Logo uploaded but could not be displayed' }
    }

    revalidatePath('/dashboard/settings')
    return { success: true, logoUrl: signed.signedUrl, logoPath }
  } catch (error: any) {
    console.error('uploadCompanyLogoAction error:', error)
    return { success: false, error: error.message || 'Failed to upload logo' }
  }
}

export async function getNotificationSettingsAction(): Promise<
  | { success: true; preferences: NotificationPreferences }
  | { success: false; error: string }
> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: company, error } = await supabaseAdmin
      .from('companies')
      .select('notification_settings')
      .eq('id', check.companyId)
      .single()

    if (error) {
      if (error.code === '42703') {
        return {
          success: true,
          preferences: normalizeNotificationPreferences(null),
        }
      }
      throw error
    }

    return {
      success: true,
      preferences: normalizeNotificationPreferences(company?.notification_settings),
    }
  } catch (error: any) {
    console.error('getNotificationSettingsAction error:', error)
    return { success: false, error: error.message || 'Failed to load notification settings' }
  }
}

export async function updateNotificationSettingsAction(
  preferences: NotificationPreferences
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }

    const normalized = normalizeNotificationPreferences(preferences)
    const supabaseAdmin = createSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('companies')
      .update({ notification_settings: normalized })
      .eq('id', check.companyId)

    if (error) {
      if (error.code === '42703') {
        return {
          success: false,
          error: 'Notifications are not enabled yet. Run supabase/notifications-schema.sql.',
        }
      }
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error: any) {
    console.error('updateNotificationSettingsAction error:', error)
    return { success: false, error: error.message || 'Failed to save notification settings' }
  }
}

export async function updateCompanySettingsAction(data: {
  timezone: string
  businessHours: BusinessHours
  companyAddress?: StructuredAddress
  companyName?: string
  isSoloBusiness?: boolean
  /** Plural label for crews (e.g. "Crews", "Teams"). Empty resets to default. */
  crewLabel?: string | null
}) {
  try {
    const session = await getSessionProfile()
    if (!session?.profile?.company_id) {
      return { success: false, error: 'Not authenticated' }
    }

    if (!data.timezone?.trim()) {
      return { success: false, error: 'Timezone is required' }
    }

    if (!isValidBusinessHoursRange(data.businessHours)) {
      return { success: false, error: 'Business hours end must be after start' }
    }

    const normalizedAddress = normalizeStructuredAddress(data.companyAddress)
    const addressValidation = validateStructuredAddress(normalizedAddress)
    if (!addressValidation.valid) {
      const firstError = Object.values(addressValidation.errors)[0]
      return { success: false, error: firstError || 'Company address is invalid' }
    }

    const companyName = data.companyName?.trim()
    if (companyName !== undefined && !companyName) {
      return { success: false, error: 'Company name is required' }
    }

  const supabaseAdmin = createSupabaseAdmin()
  const geocodeFields = await geocodeCompanyAddressFields(normalizedAddress)
  const companyUpdate: Record<string, unknown> = {
    ...(companyName !== undefined ? { name: companyName } : {}),
    timezone: data.timezone,
    business_hours_start: data.businessHours.start,
    business_hours_end: data.businessHours.end,
    business_open_weekdays: data.businessHours.openWeekdays,
    address_street: normalizedAddress.street,
    address_unit: normalizedAddress.unit || null,
    address_city: normalizedAddress.city,
    address_state: normalizedAddress.state,
    address_zip: normalizedAddress.zip,
    address: formatAddressForDisplay(normalizedAddress),
    ...geocodeFields,
  }

  if (data.isSoloBusiness !== undefined) {
    companyUpdate.is_solo_business = data.isSoloBusiness
  }

  if (data.crewLabel !== undefined) {
    const { normalizeCrewLabel, DEFAULT_CREW_LABEL } = await import(
      '@/lib/crew-terminology'
    )
    const normalized = normalizeCrewLabel(data.crewLabel)
    // Store null when default so DB stays clean and future default changes apply
    companyUpdate.crew_label =
      normalized === DEFAULT_CREW_LABEL ? null : normalized
  }

  const { error } = await supabaseAdmin
    .from('companies')
    .update(companyUpdate)
    .eq('id', session.profile.company_id)

  if (error) {
    return { success: false, error: error.message }
  }

  if (data.isSoloBusiness) {
    const { ensureSoloCrewForCompany } = await import('@/lib/solo-business-server')
    const soloSetup = await ensureSoloCrewForCompany(session.profile.company_id)
    if (!soloSetup.ok) {
      return { success: false, error: soloSetup.error }
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/crews')
  revalidatePath('/dashboard/routes')
  // Client portal shell + copy use companies.crew_label
  revalidatePath('/portal')

  const mapReady =
    'latitude' in geocodeFields &&
    geocodeFields.latitude != null &&
    geocodeFields.longitude != null

  return {
    success: true,
    companyName: companyName,
    isSoloBusiness: data.isSoloBusiness,
    mapReady,
    mapWarning: mapReady
      ? undefined
      : 'Could not locate this company address on the map. Double-check the street name and ZIP code.',
  }
  } catch (error: any) {
    console.error('updateCompanySettingsAction error:', error)
    return { success: false, error: error.message || 'Failed to save settings' }
  }
}

export async function getCompanySubscriptionAccessAction() {
  const shell = await getDashboardShellDataAction()
  if (!shell.success) {
    return { success: false as const, error: shell.error }
  }

  const { subscriptionAccess: access, profile, isSoloBusiness, soloCrewId } = shell.data
  if (!profile.company_id || !access) {
    return { success: false as const, error: 'No company associated with this account' }
  }

  const { getPlanEntitlements } = await import('@/lib/platform-entitlements')

  return {
    success: true as const,
    access,
    entitlements: getPlanEntitlements(access.plan),
    role: profile.role,
    isSoloBusiness,
    soloCrewId,
  }
}

export async function getCompanyCrewSettingsAction() {
  const check = await verifyCompanyStaff()
  if (!check.ok) return { success: false as const, error: check.error }

  const { getCompanySoloContext } = await import('@/lib/solo-business-server')
  const soloContext = await getCompanySoloContext(check.companyId)

  return {
    success: true as const,
    isSoloBusiness: soloContext.isSoloBusiness,
    soloCrewId: soloContext.soloCrewId,
    canManageMultipleCrews: !soloContext.isSoloBusiness,
  }
}

export async function updateCompanySoloModeAction(isSoloBusiness: boolean) {
  const session = await getSessionProfile()
  if (!session?.profile?.company_id) {
    return { success: false as const, error: 'Not authenticated' }
  }
  if (session.profile.role !== 'company_admin') {
    return { success: false as const, error: 'Only company admins can change business mode' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('companies')
    .update({ is_solo_business: isSoloBusiness })
    .eq('id', session.profile.company_id)

  if (error) {
    return { success: false as const, error: error.message }
  }

  if (isSoloBusiness) {
    const { ensureSoloCrewForCompany } = await import('@/lib/solo-business-server')
    const soloSetup = await ensureSoloCrewForCompany(session.profile.company_id)
    if (!soloSetup.ok) {
      return { success: false as const, error: soloSetup.error }
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/crews')

  return { success: true as const, isSoloBusiness }
}

export type CompanyTeamMember = {
  id: string
  name: string
  email: string
  role: string
  status: string
  avatar_url: string | null
  crew_id: string | null
  crew_name: string | null
}

async function verifyCompanyAdmin() {
  const check = await verifyCompanyStaff()
  if (!check.ok) return check
  if (check.session.profile.role !== 'company_admin') {
    return { ok: false as const, error: 'Only company admins can manage team members' }
  }
  return check
}

async function assertStaffEmailAvailableForCompany(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  email: string,
  companyId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await findProfileByEmail(supabaseAdmin, email)
  if (!profile) return { ok: true }

  const { data: fullProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, company_id, role, client_id')
    .eq('id', profile.id)
    .maybeSingle()

  if (!fullProfile) return { ok: true }

  if (fullProfile.company_id === companyId) {
    return { ok: false, error: 'This person is already on your team' }
  }

  if (fullProfile.role === 'client') {
    return { ok: false, error: 'This email is linked to a client portal account' }
  }

  return { ok: false, error: 'This email is already used by another account' }
}

async function verifyTeamMemberInCompany(userId: string, companyId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, company_id, role, avatar_url, crew_id')
    .eq('id', userId)
    .maybeSingle()

  if (error || !profile) {
    return { ok: false as const, error: 'Team member not found' }
  }

  if (profile.company_id !== companyId) {
    return { ok: false as const, error: 'Unauthorized' }
  }

  if (!['company_admin', 'team_member'].includes(profile.role)) {
    return { ok: false as const, error: 'This account cannot be managed here' }
  }

  return { ok: true as const, profile }
}

async function assertCompanySeatAvailable(companyId: string) {
  const { countCompanySeats } = await import('@/lib/platform-signup-server')
  const supabaseAdmin = createSupabaseAdmin()
  const { data: company, error } = await supabaseAdmin
    .from('companies')
    .select('seat_limit')
    .eq('id', companyId)
    .single()

  if (error) {
    return { ok: false as const, error: error.message }
  }

  const seatsUsed = await countCompanySeats(supabaseAdmin, companyId)
  const seatLimit = Number(company?.seat_limit) || 10

  if (seatsUsed >= seatLimit) {
    return {
      ok: false as const,
      error: `Seat limit reached (${seatLimit}). Upgrade your plan to add more team members.`,
      seatsUsed,
      seatLimit,
    }
  }

  return { ok: true as const, seatsUsed, seatLimit }
}

export async function getCompanyTeamMembersAction() {
  const check = await verifyCompanyAdmin()
  if (!check.ok) return { success: false as const, error: check.error }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const { countCompanySeats } = await import('@/lib/platform-signup-server')

    const [{ data: company }, { data: profiles }] = await Promise.all([
      supabaseAdmin
        .from('companies')
        .select('seat_limit')
        .eq('id', check.companyId)
        .single(),
      supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, role, status, avatar_url, crew_id')
        .eq('company_id', check.companyId)
        .in('role', ['company_admin', 'team_member'])
        .order('full_name'),
    ])

    const crewIds = [
      ...new Set((profiles || []).map((row) => row.crew_id).filter(Boolean)),
    ] as string[]

    let crewNameById = new Map<string, string>()
    if (crewIds.length > 0) {
      const { data: crews } = await supabaseAdmin
        .from('crews')
        .select('id, name')
        .in('id', crewIds)
      crewNameById = new Map((crews || []).map((crew) => [crew.id, crew.name]))
    }

    const members: CompanyTeamMember[] = (profiles || []).map((profile) => ({
      id: profile.id,
      name: profile.full_name || 'Unnamed User',
      email: profile.email || '',
      role: profile.role || 'team_member',
      status: profile.status || 'Active',
      avatar_url: profile.avatar_url,
      crew_id: profile.crew_id,
      crew_name: profile.crew_id ? crewNameById.get(profile.crew_id) || null : null,
    }))

    const seatsUsed = await countCompanySeats(supabaseAdmin, check.companyId)
    const seatLimit = Number(company?.seat_limit) || 10

    return {
      success: true as const,
      members,
      seatsUsed,
      seatLimit,
      currentUserId: check.userId,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load team members'
    return { success: false as const, error: message }
  }
}

export async function createCompanyTeamMemberAction(data: {
  email: string
  displayName: string
  password?: string
  role: 'team_member' | 'company_admin'
  avatarUrl?: string | null
  origin: string
}) {
  const check = await verifyCompanyAdmin()
  if (!check.ok) return { success: false as const, error: check.error }

  const email = data.email.trim().toLowerCase()
  const displayName = data.displayName.trim()

  if (!email || !displayName) {
    return { success: false as const, error: 'Display name and email are required' }
  }

  const seatGate = await assertCompanySeatAvailable(check.companyId)
  if (!seatGate.ok) return { success: false as const, error: seatGate.error }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const emailCheck = await assertStaffEmailAvailableForCompany(
      supabaseAdmin,
      email,
      check.companyId
    )
    if (!emailCheck.ok) return { success: false as const, error: emailCheck.error }

    let userId: string

    if (data.password?.trim()) {
      const { validatePassword } = await import('@/lib/password-policy')
      const passwordCheck = validatePassword(data.password.trim())
      if (!passwordCheck.ok) {
        return {
          success: false as const,
          error: passwordCheck.error || 'Password does not meet requirements',
        }
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password.trim(),
        email_confirm: true,
        user_metadata: {
          full_name: displayName,
          role: data.role,
          company_id: check.companyId,
        },
      })

      if (authError) {
        return { success: false as const, error: authError.message }
      }
      if (!authData.user) {
        return { success: false as const, error: 'Failed to create user' }
      }
      userId = authData.user.id
    } else {
      const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, email)
      if (existingAuthUser) {
        return {
          success: false as const,
          error: 'This email already has an account. Set a password to link it, or use a different email.',
        }
      }

      const { data: inviteData, error: inviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${data.origin}/login`,
          data: {
            full_name: displayName,
            role: data.role,
            company_id: check.companyId,
          },
        })

      if (inviteError) {
        return { success: false as const, error: inviteError.message }
      }
      if (!inviteData.user) {
        return { success: false as const, error: 'Failed to send invite' }
      }
      userId = inviteData.user.id
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: userId,
      full_name: displayName,
      email,
      avatar_url: data.avatarUrl || null,
      company_id: check.companyId,
      status: 'Active',
      role: data.role,
    })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { success: false as const, error: profileError.message }
    }

    revalidatePath('/dashboard/crews')
    return { success: true as const, invited: !data.password?.trim() }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add team member'
    return { success: false as const, error: message }
  }
}

export async function updateCompanyTeamMemberAction(data: {
  userId: string
  displayName: string
  password?: string
  role: 'team_member' | 'company_admin'
  avatarUrl?: string | null
}) {
  const check = await verifyCompanyAdmin()
  if (!check.ok) return { success: false as const, error: check.error }

  const displayName = data.displayName.trim()
  if (!displayName) {
    return { success: false as const, error: 'Display name is required' }
  }

  const target = await verifyTeamMemberInCompany(data.userId, check.companyId)
  if (!target.ok) return { success: false as const, error: target.error }

  if (data.userId === check.userId && data.role !== 'company_admin') {
    return { success: false as const, error: 'You cannot remove your own admin access' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const updateData: {
      password?: string
      user_metadata: { full_name: string; role: string; company_id: string }
    } = {
      user_metadata: {
        full_name: displayName,
        role: data.role,
        company_id: check.companyId,
      },
    }

    if (data.password?.trim()) {
      const { validatePassword } = await import('@/lib/password-policy')
      const passwordCheck = validatePassword(data.password.trim())
      if (!passwordCheck.ok) {
        return {
          success: false as const,
          error: passwordCheck.error || 'Password does not meet requirements',
        }
      }
      updateData.password = data.password.trim()
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      updateData
    )
    if (authError) return { success: false as const, error: authError.message }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: displayName,
        avatar_url: data.avatarUrl,
        role: data.role,
      })
      .eq('id', data.userId)

    if (profileError) return { success: false as const, error: profileError.message }

    revalidatePath('/dashboard/crews')
    return { success: true as const }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update team member'
    return { success: false as const, error: message }
  }
}

export async function deleteCompanyTeamMemberAction(
  userId: string,
  avatarUrl?: string | null
) {
  const check = await verifyCompanyAdmin()
  if (!check.ok) return { success: false as const, error: check.error }

  if (userId === check.userId) {
    return { success: false as const, error: 'You cannot remove your own account' }
  }

  const target = await verifyTeamMemberInCompany(userId, check.companyId)
  if (!target.ok) return { success: false as const, error: target.error }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    await supabaseAdmin.from('crews').update({ crew_lead_id: null }).eq('crew_lead_id', userId)
    await supabaseAdmin.from('profiles').update({ crew_id: null }).eq('id', userId)

    if (avatarUrl) {
      const path = avatarUrl.split('/user-avatars/')[1]
      if (path) {
        await supabaseAdmin.storage.from('user-avatars').remove([path])
      }
    }

    await supabaseAdmin.from('profiles').delete().eq('id', userId)

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) return { success: false as const, error: error.message }

    revalidatePath('/dashboard/crews')
    return { success: true as const }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove team member'
    return { success: false as const, error: message }
  }
}

async function verifyCompanyStaff() {
  const session = await getSessionProfile()
  if (!session) {
    return { ok: false as const, error: 'Not authenticated' }
  }
  if (!session.profile.company_id) {
    return { ok: false as const, error: 'No company associated with this account' }
  }
  if (!['company_admin', 'team_member'].includes(session.profile.role)) {
    return { ok: false as const, error: 'Unauthorized' }
  }

  const subscription = await verifyStaffSubscriptionAccess(session.profile.company_id)
  if (!subscription.ok) {
    return { ok: false as const, error: TRIAL_EXPIRED_ERROR }
  }

  return {
    ok: true as const,
    session,
    companyId: session.profile.company_id,
    userId: session.userId,
  }
}

async function verifyLeadOwnership(leadId: string) {
  const check = await verifyCompanyStaff()
  if (!check.ok) return check

  const supabaseAdmin = createSupabaseAdmin()
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('company_id', check.companyId)
    .single()

  if (error || !lead) {
    return { ok: false as const, error: 'Lead not found' }
  }

  return { ...check, lead: lead as Lead }
}

async function insertLeadActivity(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  data: {
    leadId: string
    companyId: string
    type: LeadActivity['type']
    body?: string | null
    createdBy?: string | null
  }
) {
  await supabaseAdmin.from('lead_activities').insert({
    lead_id: data.leadId,
    company_id: data.companyId,
    type: data.type,
    body: data.body ?? null,
    created_by: data.createdBy ?? null,
  })
}

export async function getLeadsAction(options?: { includeArchived?: boolean }) {
  const check = await verifyCompanyStaff()
  if (!check.ok) return { success: false as const, error: check.error }

  const supabaseAdmin = createSupabaseAdmin()
  let query = supabaseAdmin
    .from('leads')
    .select('*')
    .eq('company_id', check.companyId)
    .order('follow_up_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (!options?.includeArchived) {
    query = query.neq('status', 'archived')
  }

  const { data, error } = await query
  if (error) {
    console.error('getLeadsAction error:', error)
    return { success: false as const, error: error.message }
  }

  return { success: true as const, data: (data || []) as Lead[] }
}

export async function getLeadActivitiesAction(leadId: string) {
  const check = await verifyLeadOwnership(leadId)
  if (!check.ok) return { success: false as const, error: check.error }

  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('lead_activities')
    .select('*, profiles:created_by(full_name)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getLeadActivitiesAction error:', error)
    return { success: false as const, error: error.message }
  }

  const activities: LeadActivity[] = (data || []).map((row: any) => ({
    id: row.id,
    lead_id: row.lead_id,
    company_id: row.company_id,
    type: row.type,
    body: row.body,
    created_by: row.created_by,
    created_at: row.created_at,
    creator_name: row.profiles?.full_name ?? null,
  }))

  return { success: true as const, data: activities }
}

export async function createLeadAction(data: {
  name: string
  contact_name?: string
  email?: string
  phone?: string
  leadAddress?: StructuredAddress
  source?: LeadSource
  status?: LeadStatus
  priority?: LeadPriority
  follow_up_at?: string | null
  notes?: string
  estimated_value?: number | null
}) {
  const check = await verifyCompanyStaff()
  if (!check.ok) return { success: false as const, error: check.error }

  if (!data.name.trim()) {
    return { success: false as const, error: 'Lead name is required' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    let addressFields: ReturnType<typeof buildStructuredAddressDbFields> | null = null
    if (data.leadAddress) {
      const normalized = normalizeStructuredAddress(data.leadAddress)
      const validation = validateStructuredAddressIfPresent(normalized)
      if (!validation.valid) {
        const firstError = Object.values(validation.errors)[0]
        return { success: false as const, error: firstError || 'Address is invalid' }
      }
      addressFields = buildStructuredAddressDbFields(normalized)
    }

    const source = data.source && LEAD_SOURCES.includes(data.source) ? data.source : 'other'
    const status = data.status && LEAD_STATUSES.includes(data.status) ? data.status : 'new'
    const priority = data.priority && LEAD_PRIORITIES.includes(data.priority) ? data.priority : 'normal'

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .insert({
        company_id: check.companyId,
        name: data.name.trim(),
        contact_name: data.contact_name?.trim() || null,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        address: addressFields?.address ?? null,
        address_street: addressFields?.address_street ?? null,
        address_unit: addressFields?.address_unit ?? null,
        address_city: addressFields?.address_city ?? null,
        address_state: addressFields?.address_state ?? null,
        address_zip: addressFields?.address_zip ?? null,
        source,
        status,
        priority,
        follow_up_at: data.follow_up_at ?? null,
        notes: data.notes?.trim() || null,
        estimated_value: data.estimated_value ?? null,
      })
      .select('*')
      .single()

    if (error) throw error

    await insertLeadActivity(supabaseAdmin, {
      leadId: lead.id,
      companyId: check.companyId,
      type: 'note',
      body: 'Lead created',
      createdBy: check.userId,
    })

    const { queueCompanyZapierEvent } = await import('@/lib/integration-events')
    queueCompanyZapierEvent(supabaseAdmin, {
      companyId: check.companyId,
      event: 'lead_created',
      data: {
        lead_id: lead.id,
        name: lead.name,
        contact_name: lead.contact_name,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        status: lead.status,
        estimated_value: lead.estimated_value,
      },
    })

    revalidatePath('/dashboard/leads')
    return { success: true as const, data: lead as Lead }
  } catch (error: any) {
    console.error('createLeadAction error:', error)
    return { success: false as const, error: error.message || 'Failed to create lead' }
  }
}

export async function updateLeadAction(data: {
  id: string
  name?: string
  contact_name?: string
  email?: string
  phone?: string
  leadAddress?: StructuredAddress
  source?: LeadSource
  status?: LeadStatus
  priority?: LeadPriority
  follow_up_at?: string | null
  notes?: string
  estimated_value?: number | null
}) {
  const check = await verifyLeadOwnership(data.id)
  if (!check.ok) return { success: false as const, error: check.error }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (data.name !== undefined) updates.name = data.name.trim()
    if (data.contact_name !== undefined) updates.contact_name = data.contact_name.trim() || null
    if (data.email !== undefined) updates.email = data.email.trim() || null
    if (data.phone !== undefined) updates.phone = data.phone.trim() || null
    if (data.notes !== undefined) updates.notes = data.notes.trim() || null
    if (data.estimated_value !== undefined) updates.estimated_value = data.estimated_value
    if (data.follow_up_at !== undefined) updates.follow_up_at = data.follow_up_at

    if (data.source && LEAD_SOURCES.includes(data.source)) updates.source = data.source
    if (data.priority && LEAD_PRIORITIES.includes(data.priority)) updates.priority = data.priority

    if (data.leadAddress) {
      const normalized = normalizeStructuredAddress(data.leadAddress)
      const validation = validateStructuredAddressIfPresent(normalized)
      if (!validation.valid) {
        const firstError = Object.values(validation.errors)[0]
        return { success: false as const, error: firstError || 'Address is invalid' }
      }
      const addressFields = buildStructuredAddressDbFields(normalized)
      updates.address = addressFields.address
      updates.address_street = addressFields.address_street
      updates.address_unit = addressFields.address_unit
      updates.address_city = addressFields.address_city
      updates.address_state = addressFields.address_state
      updates.address_zip = addressFields.address_zip
    }

    if (data.status && LEAD_STATUSES.includes(data.status) && data.status !== check.lead.status) {
      updates.status = data.status
      if (data.status === 'archived') {
        updates.archived_at = new Date().toISOString()
      } else if (check.lead.status === 'archived') {
        updates.archived_at = null
      }
    }

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .update(updates)
      .eq('id', data.id)
      .select('*')
      .single()

    if (error) throw error

    if (data.status && data.status !== check.lead.status) {
      await insertLeadActivity(supabaseAdmin, {
        leadId: data.id,
        companyId: check.companyId,
        type: 'status_change',
        body: `Status changed to ${data.status}`,
        createdBy: check.userId,
      })
    }

    if (data.follow_up_at !== undefined && data.follow_up_at !== check.lead.follow_up_at) {
      await insertLeadActivity(supabaseAdmin, {
        leadId: data.id,
        companyId: check.companyId,
        type: 'follow_up_set',
        body: data.follow_up_at
          ? `Follow-up set for ${new Date(data.follow_up_at).toLocaleString()}`
          : 'Follow-up cleared',
        createdBy: check.userId,
      })
    }

    revalidatePath('/dashboard/leads')
    return { success: true as const, data: lead as Lead }
  } catch (error: any) {
    console.error('updateLeadAction error:', error)
    return { success: false as const, error: error.message || 'Failed to update lead' }
  }
}

export async function updateLeadStatusAction(leadId: string, status: LeadStatus) {
  if (!LEAD_STATUSES.includes(status)) {
    return { success: false as const, error: 'Invalid status' }
  }
  return updateLeadAction({ id: leadId, status })
}

export async function archiveLeadAction(leadId: string) {
  return updateLeadAction({ id: leadId, status: 'archived' })
}

export async function restoreLeadAction(leadId: string) {
  const check = await verifyLeadOwnership(leadId)
  if (!check.ok) return { success: false as const, error: check.error }
  if (check.lead.status !== 'archived') {
    return { success: false as const, error: 'Lead is not archived' }
  }

  const restoredStatus: LeadStatus = check.lead.converted_client_id ? 'won' : 'new'
  const result = await updateLeadAction({ id: leadId, status: restoredStatus })
  if (!result.success) return result

  const supabaseAdmin = createSupabaseAdmin()
  await insertLeadActivity(supabaseAdmin, {
    leadId,
    companyId: check.companyId,
    type: 'restored',
    body: `Lead restored as ${restoredStatus}`,
    createdBy: check.userId,
  })

  return result
}

export async function addLeadActivityAction(leadId: string, body: string) {
  const check = await verifyLeadOwnership(leadId)
  if (!check.ok) return { success: false as const, error: check.error }
  if (!body.trim()) return { success: false as const, error: 'Note cannot be empty' }

  const supabaseAdmin = createSupabaseAdmin()
  await insertLeadActivity(supabaseAdmin, {
    leadId,
    companyId: check.companyId,
    type: 'note',
    body: body.trim(),
    createdBy: check.userId,
  })

  revalidatePath('/dashboard/leads')
  return { success: true as const }
}

export async function getReportsDataAction(
  period: ReportsPeriod = '30d'
): Promise<{ success: true; data: ReportsData } | { success: false; error: string }> {
  try {
    const check = await verifyCompanyStaff()
    if (!check.ok) return { success: false, error: check.error }

    const { assertCompanyPlatformFeature } = await import(
      '@/lib/platform-entitlements-server'
    )
    const featureGate = await assertCompanyPlatformFeature(check.companyId, 'reports')
    if (!featureGate.ok) return { success: false, error: featureGate.error }

    const supabaseAdmin = createSupabaseAdmin()
    const companyId = check.companyId
    const now = new Date()

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('timezone')
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Company not found' }
    }

    const timezone = company.timezone || 'America/Chicago'

    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id, name, status')
      .eq('company_id', companyId)

    if (clientsError) throw clientsError

    const clientIds = (clients || []).map((client) => client.id)

    const {
      schedules,
      lineItems,
      payments,
      invoiceDocuments,
      scheduleStatusCounts,
    } = await fetchReportsBillingBundle({
      supabaseAdmin,
      companyId,
      clientIds,
      period,
      timezone,
      now,
    })

    const periodStart = getReportsPeriodStart(period, timezone, now)
    const periodStartIso = periodStart ? periodStart.toISOString() : null

    let leadsConverted = 0
    let estimatesSent = 0

    const leadsQuery = supabaseAdmin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .not('converted_at', 'is', null)

    if (periodStartIso) {
      leadsQuery.gte('converted_at', periodStartIso)
    }

    const { count: leadsConvertedCount, error: leadsError } = await leadsQuery
    if (leadsError && leadsError.code !== '42P01') throw leadsError
    if (!leadsError) leadsConverted = leadsConvertedCount || 0

    const estimatesQuery = supabaseAdmin
      .from('estimates')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['sent', 'accepted', 'declined', 'converted'])

    if (periodStartIso) {
      estimatesQuery.gte('updated_at', periodStartIso)
    }

    const { count: estimatesSentCount, error: estimatesError } = await estimatesQuery
    if (estimatesError) throw estimatesError
    estimatesSent = estimatesSentCount || 0

    const data = buildReportsData({
      period,
      timezone,
      lineItems,
      payments,
      schedules,
      clients: clients || [],
      invoiceDocuments,
      leadsConverted,
      estimatesSent,
      scheduleStatusCounts,
      now,
    })

    return { success: true, data }
  } catch (error: any) {
    console.error('getReportsDataAction error:', error)
    return { success: false, error: error.message || 'Failed to load reports' }
  }
}

export async function convertLeadToClientAction(leadId: string) {
  const check = await verifyLeadOwnership(leadId)
  if (!check.ok) return { success: false as const, error: check.error }

  if (check.lead.converted_client_id) {
    return {
      success: true as const,
      clientId: check.lead.converted_client_id,
      alreadyConverted: true as const,
    }
  }

  const supabaseAdmin = createSupabaseAdmin()

  try {
    const lead = check.lead
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .insert({
        company_id: check.companyId,
        name: lead.name,
        contact_name: lead.contact_name,
        email: lead.email,
        phone: lead.phone,
        address: lead.address,
        address_street: lead.address_street,
        address_unit: lead.address_unit,
        address_city: lead.address_city,
        address_state: lead.address_state,
        address_zip: lead.address_zip,
        notes: lead.notes,
        status: 'active',
      })
      .select('id')
      .single()

    if (clientError) throw clientError

    const now = new Date().toISOString()
    const { error: leadError } = await supabaseAdmin
      .from('leads')
      .update({
        status: 'won',
        converted_client_id: client.id,
        converted_at: now,
        updated_at: now,
      })
      .eq('id', leadId)

    if (leadError) throw leadError

    await insertLeadActivity(supabaseAdmin, {
      leadId,
      companyId: check.companyId,
      type: 'converted',
      body: 'Converted to client',
      createdBy: check.userId,
    })

    revalidatePath('/dashboard/leads')
    revalidatePath('/dashboard/clients')
    revalidatePath(`/dashboard/clients/${client.id}`)

    return { success: true as const, clientId: client.id, alreadyConverted: false as const }
  } catch (error: any) {
    console.error('convertLeadToClientAction error:', error)
    return { success: false as const, error: error.message || 'Failed to convert lead' }
  }
}

// ============================================
// Messaging
// ============================================

export async function getMessagingThreadAction(
  clientId: string,
  scheduleId?: string | null
): Promise<
  | {
      success: true
      thread: MessagingThread
      messages: MessagingMessage[]
      companyName: string | null
      clientName: string | null
    }
  | { success: false; error: string }
> {
  try {
    const access = scheduleId
      ? await verifyScheduleCompanyAccess(scheduleId, clientId)
      : await verifyClientCompanyAccess(clientId)

    if (!access.ok) {
      return { success: false, error: access.error }
    }

    const supabaseAdmin = createSupabaseAdmin()

    if (scheduleId) {
      const belongs = await verifyScheduleBelongsToClient(
        supabaseAdmin,
        scheduleId,
        clientId
      )
      if (!belongs) {
        return { success: false, error: 'Job not found' }
      }
    }

    const [{ data: company }, { data: client }] = await Promise.all([
      supabaseAdmin
        .from('companies')
        .select('name')
        .eq('id', access.companyId)
        .single(),
      supabaseAdmin.from('clients').select('name').eq('id', clientId).single(),
    ])

    const thread = await getOrCreateMessagingThread(supabaseAdmin, {
      companyId: access.companyId,
      clientId,
      scheduleId: scheduleId ?? null,
    })

    const messages = await listMessagingMessages(supabaseAdmin, thread.id)

    return {
      success: true,
      thread,
      messages,
      companyName: company?.name?.trim() || null,
      clientName: client?.name?.trim() || null,
    }
  } catch (error: any) {
    console.error('getMessagingThreadAction error:', error)
    return { success: false, error: error.message || 'Failed to load messages' }
  }
}

export async function sendMessagingMessageAction(
  clientId: string,
  body: string,
  scheduleId?: string | null
): Promise<
  | { success: true; message: MessagingMessage }
  | { success: false; error: string }
> {
  try {
    const validation = validateMessageBody(body)
    if (!validation.ok) {
      return { success: false, error: validation.error }
    }

    const access = scheduleId
      ? await verifyScheduleCompanyAccess(scheduleId, clientId)
      : await verifyClientCompanyAccess(clientId)

    if (!access.ok) {
      return { success: false, error: access.error }
    }

    const supabaseAdmin = createSupabaseAdmin()

    if (scheduleId) {
      const belongs = await verifyScheduleBelongsToClient(
        supabaseAdmin,
        scheduleId,
        clientId
      )
      if (!belongs) {
        return { success: false, error: 'Job not found' }
      }
    }

    const thread = await getOrCreateMessagingThread(supabaseAdmin, {
      companyId: access.companyId,
      clientId,
      scheduleId: scheduleId ?? null,
    })

    const senderName = await resolveStaffMessageSenderName(supabaseAdmin, {
      companyId: access.companyId,
      clientId,
      profile: access.session.profile,
    })

    const message = await insertMessagingMessage(supabaseAdmin, {
      threadId: thread.id,
      companyId: access.companyId,
      senderUserId: access.userId,
      senderRole: 'staff',
      senderName,
      body: validation.body,
    })

    revalidatePath(`/dashboard/clients/${clientId}`)
    if (scheduleId) {
      revalidatePath(`/dashboard/clients/${clientId}/jobs/${scheduleId}`)
    }
    revalidatePath('/portal/messages')

    void queueNotification(supabaseAdmin, async (admin) => {
      const [{ data: client }, { data: company }] = await Promise.all([
        admin
          .from('clients')
          .select('name, email, phone, portal_enabled')
          .eq('id', clientId)
          .single(),
        admin.from('companies').select('name').eq('id', access.companyId).single(),
      ])

      if (!client?.portal_enabled) return

      await notifyClientMessageFromStaff(admin, {
        companyId: access.companyId,
        companyName: company?.name,
        clientEmail: client?.email,
        clientPhone: client?.phone,
        clientName: client?.name,
        messagePreview: validation.body,
        scheduleId: scheduleId ?? null,
      })
    })

    return { success: true, message }
  } catch (error: any) {
    console.error('sendMessagingMessageAction error:', error)
    return { success: false, error: error.message || 'Failed to send message' }
  }
}

export async function submitBetaFeedbackAction(input: {
  preview?: boolean
  feedbackType?: 'bug' | 'feature' | 'other'
  message?: string
  pageUrl?: string | null
  userAgent?: string | null
  contactEmail?: string
}) {
  const session = await getSessionProfile()

  if (input.preview) {
    return {
      success: true as const,
      mode: 'preview' as const,
      requiresEmail: !session,
      submitterEmail: session?.profile.email ?? null,
    }
  }

  const feedbackType = input.feedbackType
  if (feedbackType !== 'bug' && feedbackType !== 'feature' && feedbackType !== 'other') {
    return { success: false as const, error: 'Select a feedback type' }
  }

  let submitterEmail = input.contactEmail?.trim() || null
  let submitterName: string | null = null
  let submitterRole: string | null = null
  let companyId: string | null = null
  let companyName: string | null = null
  let submitterUserId: string | null = null

  if (session) {
    submitterUserId = session.userId
    submitterName = session.profile.full_name || null
    submitterRole = session.profile.role || null
    companyId = session.profile.company_id || null
    submitterEmail = session.profile.email || submitterEmail

    if (companyId) {
      const { data: company } = await createSupabaseAdmin()
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .maybeSingle()
      companyName = company?.name || null
    }
  } else if (!submitterEmail) {
    return { success: false as const, error: 'Please enter your email' }
  }

  const { createBetaFeedbackSubmission } = await import('@/lib/beta-feedback-server')
  const result = await createBetaFeedbackSubmission({
    feedbackType,
    message: input.message || '',
    pageUrl: input.pageUrl,
    userAgent: input.userAgent,
    submitterUserId,
    submitterEmail,
    submitterName,
    submitterRole,
    companyId,
    companyName,
    metadata: {
      submitted_at_client: new Date().toISOString(),
    },
  })

  if (!result.success) {
    return { success: false as const, error: result.error }
  }

  return { success: true as const, mode: 'submit' as const }
}

export async function getAdminBetaFeedbackAction() {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { success: false as const, error: adminCheck.error }
  }

  try {
    const { listBetaFeedbackForAdmin } = await import('@/lib/beta-feedback-server')
    const items = await listBetaFeedbackForAdmin()
    return { success: true as const, items }
  } catch (error: any) {
    console.error('getAdminBetaFeedbackAction error:', error)
    return { success: false as const, error: error.message || 'Failed to load feedback' }
  }
}

export async function updateBetaFeedbackStatusAction(
  feedbackId: string,
  status: 'new' | 'reviewed' | 'resolved'
) {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { success: false as const, error: adminCheck.error }
  }

  if (status !== 'new' && status !== 'reviewed' && status !== 'resolved') {
    return { success: false as const, error: 'Invalid status' }
  }

  try {
    const { updateBetaFeedbackStatus } = await import('@/lib/beta-feedback-server')
    const item = await updateBetaFeedbackStatus(feedbackId, status)
    if (!item) {
      return { success: false as const, error: 'Feedback not found' }
    }
    revalidatePath('/admin')
    return { success: true as const, item }
  } catch (error: any) {
    console.error('updateBetaFeedbackStatusAction error:', error)
    return { success: false as const, error: error.message || 'Failed to update feedback' }
  }
}

export async function getPlatformReleaseModeAction(): Promise<
  | { success: true; mode: import('@/lib/platform-settings').PlatformReleaseMode }
  | { success: false; error: string }
> {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { success: false, error: adminCheck.error }
  }

  try {
    const { getPlatformReleaseMode } = await import('@/lib/platform-settings-server')
    const mode = await getPlatformReleaseMode()
    return { success: true, mode }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load release mode'
    return { success: false, error: message }
  }
}

export async function updatePlatformReleaseModeAction(
  mode: import('@/lib/platform-settings').PlatformReleaseMode
): Promise<{ success: true } | { success: false; error: string }> {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { success: false, error: adminCheck.error }
  }

  try {
    const { setPlatformReleaseMode } = await import('@/lib/platform-settings-server')
    const result = await setPlatformReleaseMode(mode)
    if (!result.ok) {
      return { success: false, error: result.error }
    }
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update release mode'
    return { success: false, error: message }
  }
}

export async function getPlatformReleaseSettingsAction(): Promise<
  | {
      success: true
      releaseMode: import('@/lib/platform-settings').PlatformReleaseMode
      scheduledReleaseAt: string | null
    }
  | { success: false; error: string }
> {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { success: false, error: adminCheck.error }
  }

  try {
    const { getPlatformSettings } = await import('@/lib/platform-settings-server')
    const settings = await getPlatformSettings()
    return {
      success: true,
      releaseMode: settings.releaseMode,
      scheduledReleaseAt: settings.scheduledReleaseAt,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load release settings'
    return { success: false, error: message }
  }
}

export async function updatePlatformReleaseScheduleAction(
  scheduledReleaseAt: string | null
): Promise<{ success: true } | { success: false; error: string }> {
  const adminCheck = await assertPlatformAdmin()
  if (!adminCheck.ok) {
    return { success: false, error: adminCheck.error }
  }

  if (scheduledReleaseAt) {
    const parsed = new Date(scheduledReleaseAt)
    if (Number.isNaN(parsed.getTime())) {
      return { success: false, error: 'Invalid launch date' }
    }
    if (parsed.getTime() <= Date.now()) {
      return { success: false, error: 'Launch date must be in the future' }
    }
  }

  try {
    const { setPlatformReleaseSchedule } = await import('@/lib/platform-settings-server')
    const result = await setPlatformReleaseSchedule(scheduledReleaseAt)
    if (!result.ok) {
      return { success: false, error: result.error }
    }
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update release schedule'
    return { success: false, error: message }
  }
}

export async function submitBetaAccessRequestAction(input: {
  fullName: string
  email: string
  companyName: string
  phone?: string
  teamSize?: string
  message?: string
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { createBetaAccessRequest } = await import('@/lib/beta-access-request-server')
    const result = await createBetaAccessRequest(input)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to submit request'
    return { success: false, error: message }
  }
}
