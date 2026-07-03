'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import {
  checkJobConflict,
  suggestAlternativeCrews
} from '@/lib/scheduling'
import { calcBillingSummary, calcLineAmount } from '@/lib/billing'
import { seedBillingFromJobPrice, duplicateBillingToSchedule } from '@/lib/billing-server'
import { getCompanyStripeStatus } from '@/lib/stripe-connect'
import {
  recalcEstimateTotal,
  syncEstimateDocument,
  seedBillingFromEstimate,
  applyAutoEstimateStatus,
} from '@/lib/estimates-server'
import { cookies } from 'next/headers'
import { getSessionProfile } from '@/lib/portal-auth'
import {
  isThemePreference,
  THEME_COOKIE_NAME,
  type ThemePreference,
} from '@/lib/theme'
import {
  normalizeBusinessHours,
  isValidBusinessHoursRange,
  shouldShowTomorrowTimeline,
  type BusinessHours,
} from '@/lib/business-hours'
import { formatCompanyDateLabel, getCompanyDayBounds } from '@/lib/timezone'
import {
  assignTimelineLanes,
  buildCrewSummaries,
  buildTimelineJobs,
  type DashboardOverviewData,
} from '@/lib/dashboard-overview'
import { buildDashboardMapData, type DashboardMapData } from '@/lib/dashboard-map'
import { buildRoutePlannerData, type RoutePlannerData } from '@/lib/route-planner'
import { geocodeStructuredAddress } from '@/lib/geocoding'
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
  findProfileByClientId,
  isEmailAlreadyRegisteredError,
  linkClientPortalAccess,
  upsertClientPortalProfile,
} from '@/lib/portal-users'

export async function createCompanyUser(data: {
  email: string
  password: string
  displayName: string
  role: string
  avatarUrl?: string | null
  companyId: string
}) {
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
    .select('id, name')
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
    .select('company_id')

  // Build user counts
  const userCountMap: Record<string, number> = {}
  let totalUsers = 0

  if (profilesData) {
    profilesData.forEach((profile) => {
      if (profile.company_id) {
        userCountMap[profile.company_id] = (userCountMap[profile.company_id] || 0) + 1
        totalUsers++
      }
    })
  }

  // Merge counts into companies
  const companiesWithCounts = companiesData?.map((company: any) => ({
    ...company,
    users: userCountMap[company.id] || 0,
  })) || []

  return {
    companies: companiesWithCounts,
    totalUsers,
  }
}

export async function updateCompanyUser(data: {
  userId: string
  displayName: string
  password?: string
  role: string
  avatarUrl?: string | null
}) {
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
    // Create the crew
    const { data: crewData, error: crewError } = await supabaseAdmin
      .from('crews')
      .insert({
        name: data.name,
        company_id: data.companyId,
        crew_lead_id: data.crewLeadId || null,
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
    // 1. Update crew name and lead
    const { error: crewError } = await supabaseAdmin
      .from('crews')
      .update({
        name: data.name,
        crew_lead_id: data.crewLeadId || null,
      })
      .eq('id', data.crewId)

    if (crewError) throw crewError

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
      company_id: data.companyId,
      status: 'active',
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
    } else if (data.address !== undefined) {
      updateData.address = data.address || null
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
    // Check for conflicts using schedules table
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
          data.companyId,
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

        const stripeStatus = await getCompanyStripeStatus(data.companyId)
        if (stripeStatus.billingEnabled && newSchedule && (data.price || 0) > 0) {
          await seedBillingFromJobPrice(
            supabaseAdmin,
            newSchedule.id,
            data.clientId,
            data.companyId,
            data.title,
            data.price || 0
          )
        }

        revalidatePath(`/dashboard/clients/${data.clientId}`)
        revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${newSchedule.id}`)

        return { success: true, schedule: newSchedule }
  } catch (error: any) {
    console.error('Error creating schedule:', error)
    return {
      success: false,
      error: error.message || 'Failed to create job',
    }
  }
}

async function syncScheduleStatusesForClient(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  clientId: string
) {
  const now = new Date().toISOString()
  let activated = 0
  let archived = 0

  const { data: toActivate } = await supabaseAdmin
    .from('schedules')
    .select('id')
    .eq('client_id', clientId)
    .eq('status', 'scheduled')
    .lte('start_time', now)
    .gt('end_time', now)

  if (toActivate && toActivate.length > 0) {
    await supabaseAdmin
      .from('schedules')
      .update({ status: 'in_progress' })
      .in('id', toActivate.map((s) => s.id))
    activated = toActivate.length
  }

  const { data: toArchive } = await supabaseAdmin
    .from('schedules')
    .select('*')
    .eq('client_id', clientId)
    .neq('status', 'archived')
    .lt('end_time', now)

  if (toArchive && toArchive.length > 0) {
    for (const schedule of toArchive) {
      await supabaseAdmin
        .from('schedules')
        .update({ status: 'archived' })
        .eq('id', schedule.id)
      archived++

      if (schedule.recurring_rule_id) {
        await generateNextRecurringInstance(schedule, supabaseAdmin)
      }
    }
  }

  return { activated, archived }
}

export async function syncScheduleStatusesAction(clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { activated, archived } = await syncScheduleStatusesForClient(supabaseAdmin, clientId)

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
// Helper: Create next recurring instance
// ============================================
async function generateNextRecurringInstance(currentSchedule: any, supabaseAdmin: any) {
  if (!currentSchedule.recurring_rule_id) return

  // Get the recurring rule
  const { data: rule } = await supabaseAdmin
    .from('recurring_rules')
    .select('*')
    .eq('id', currentSchedule.recurring_rule_id)
    .single()

  if (!rule) return

  const currentEnd = new Date(currentSchedule.end_time)
  let nextStart = new Date(currentEnd)

  // Calculate next occurrence
  switch (rule.frequency) {
    case 'daily':
      nextStart.setDate(nextStart.getDate() + (rule.interval || 1))
      break
    case 'weekly':
      nextStart.setDate(nextStart.getDate() + 7 * (rule.interval || 1))
      break
    case 'monthly':
      nextStart.setMonth(nextStart.getMonth() + (rule.interval || 1))
      break
    default:
      return
  }

  const duration = new Date(currentSchedule.end_time).getTime() - new Date(currentSchedule.start_time).getTime()
  const nextEnd = new Date(nextStart.getTime() + duration)

  // Check if crew is available for the new time slot
  let hasConflict = false
  if (currentSchedule.crew_id) {
    const { data: conflicts } = await supabaseAdmin
      .from('schedules')
      .select('id')
      .eq('crew_id', currentSchedule.crew_id)
      .neq('status', 'archived')
      .lte('start_time', nextEnd.toISOString())
      .gte('end_time', nextStart.toISOString())

    hasConflict = !!(conflicts && conflicts.length > 0)
  }

  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('company_id')
    .eq('id', currentSchedule.client_id)
    .single()

  const { data: newSchedule, error: insertError } = await supabaseAdmin
    .from('schedules')
    .insert({
      client_id: currentSchedule.client_id,
      crew_id: currentSchedule.crew_id,
      recurring_rule_id: currentSchedule.recurring_rule_id,
      title: currentSchedule.title,
      description: currentSchedule.description,
      start_time: nextStart.toISOString(),
      end_time: nextEnd.toISOString(),
      status: 'scheduled',
      price: currentSchedule.price || 0,
    })
    .select()
    .single()

  if (insertError || !newSchedule) {
    console.error('Failed to create recurring schedule:', insertError)
    return
  }

  if (client?.company_id) {
    const stripeStatus = await getCompanyStripeStatus(client.company_id)
    if (stripeStatus.billingEnabled) {
      await duplicateBillingToSchedule(
        supabaseAdmin,
        currentSchedule.id,
        newSchedule.id,
        currentSchedule.client_id,
        client.company_id,
        {
          title: currentSchedule.title,
          price: currentSchedule.price || 0,
        }
      )
    }
  }

  revalidatePath(`/dashboard/clients/${currentSchedule.client_id}`)
  revalidatePath(`/dashboard/clients/${currentSchedule.client_id}/jobs/${newSchedule.id}`)

  if (hasConflict) {
    console.log(`Created next recurring schedule for ${currentSchedule.id} but crew has conflict`)
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

export async function getJobAction(jobId: string, clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { data, error } = await supabaseAdmin
      .from('schedules')
      .select(`
        *,
        crew:crews!crew_id (id, name),
        client:clients!client_id (id, name)
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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .eq('id', data.jobId)
      .eq('client_id', data.clientId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Job not found' }
    }

    if (existing.status === 'archived' || existing.status === 'cancelled') {
      return { success: false, error: 'Cannot edit archived or cancelled jobs' }
    }

    const startTime = data.startTime ?? existing.start_time
    const endTime = data.endTime ?? existing.end_time
    const crewId = data.crewId !== undefined ? data.crewId : existing.crew_id

    if (crewId) {
      const { data: conflicting } = await supabaseAdmin
        .from('schedules')
        .select('id')
        .eq('crew_id', crewId)
        .neq('id', data.jobId)
        .neq('status', 'cancelled')
        .neq('status', 'archived')
        .lte('start_time', endTime)
        .gte('end_time', startTime)

      if (conflicting && conflicting.length > 0) {
        const alternatives = await suggestAlternativeCrews(
          data.companyId,
          startTime,
          endTime,
          crewId
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

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.jobId}`)

    return { success: true, job: updated }
  } catch (error: any) {
    console.error('updateJobAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function cancelJobAction(jobId: string, clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { data: existing } = await supabaseAdmin
      .from('schedules')
      .select('status')
      .eq('id', jobId)
      .eq('client_id', clientId)
      .single()

    if (!existing) return { success: false, error: 'Job not found' }
    if (existing.status !== 'scheduled') {
      return { success: false, error: 'Only scheduled jobs can be cancelled' }
    }

    const { error } = await supabaseAdmin
      .from('schedules')
      .update({ status: 'cancelled' })
      .eq('id', jobId)

    if (error) throw error

    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath(`/dashboard/clients/${clientId}/jobs/${jobId}`)

    return { success: true }
  } catch (error: any) {
    console.error('cancelJobAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function archiveJobAction(jobId: string, clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { data: existing } = await supabaseAdmin
      .from('schedules')
      .select('status, recurring_rule_id')
      .eq('id', jobId)
      .eq('client_id', clientId)
      .single()

    if (!existing) return { success: false, error: 'Job not found' }
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

    return { success: true }
  } catch (error: any) {
    console.error('archiveJobAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteJobAction(jobId: string, clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const { data: existing } = await supabaseAdmin
      .from('schedules')
      .select('status')
      .eq('id', jobId)
      .eq('client_id', clientId)
      .single()

    if (!existing) return { success: false, error: 'Job not found' }
    if (existing.status !== 'scheduled' && existing.status !== 'cancelled') {
      return { success: false, error: 'Only scheduled or cancelled jobs can be deleted' }
    }

    const { error } = await supabaseAdmin
      .from('schedules')
      .delete()
      .eq('id', jobId)

    if (error) throw error

    revalidatePath(`/dashboard/clients/${clientId}`)

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
    .select('id, client_id, title, start_time, status, price')
    .eq('id', scheduleId)
    .eq('client_id', clientId)
    .single()

  if (error || !data) return null
  return data
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

async function assertBillingEnabled(companyId: string) {
  const status = await getCompanyStripeStatus(companyId)
  if (!status.billingEnabled) {
    return { ok: false as const, error: 'Connect Stripe in Settings to enable billing' }
  }
  return { ok: true as const, status }
}

export async function getJobBillingAction(scheduleId: string, clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const schedule = await verifyScheduleOwnership(scheduleId, clientId)
    if (!schedule) return { success: false, error: 'Job not found' }

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
      },
    }
  } catch (error: any) {
    console.error('getJobBillingAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function getClientBillingAction(clientId: string) {
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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const billingCheck = await assertBillingEnabled(data.companyId)
    if (!billingCheck.ok) return { success: false, error: billingCheck.error }

    const schedule = await verifyScheduleOwnership(data.scheduleId, data.clientId)
    if (!schedule) return { success: false, error: 'Job not found' }

    const amount = calcLineAmount(data.quantity, data.unitPrice)

    const { data: item, error } = await supabaseAdmin
      .from('billing_line_items')
      .insert({
        schedule_id: data.scheduleId,
        client_id: data.clientId,
        company_id: data.companyId,
        description: data.description.trim(),
        quantity: data.quantity,
        unit_price: data.unitPrice,
        amount,
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.scheduleId}`)

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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const billingCheck = await assertBillingEnabled(data.companyId)
    if (!billingCheck.ok) return { success: false, error: billingCheck.error }

    const schedule = await verifyScheduleOwnership(data.scheduleId, data.clientId)
    if (!schedule) return { success: false, error: 'Job not found' }

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

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.scheduleId}`)

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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const billingCheck = await assertBillingEnabled(companyId)
    if (!billingCheck.ok) return { success: false, error: billingCheck.error }

    const schedule = await verifyScheduleOwnership(scheduleId, clientId)
    if (!schedule) return { success: false, error: 'Job not found' }

    const { error } = await supabaseAdmin
      .from('billing_line_items')
      .delete()
      .eq('id', id)
      .eq('schedule_id', scheduleId)

    if (error) throw error

    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath(`/dashboard/clients/${clientId}/jobs/${scheduleId}`)

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
}) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const billingCheck = await assertBillingEnabled(data.companyId)
    if (!billingCheck.ok) return { success: false, error: billingCheck.error }

    const schedule = await verifyScheduleOwnership(data.scheduleId, data.clientId)
    if (!schedule) return { success: false, error: 'Job not found' }

    const { data: payment, error } = await supabaseAdmin
      .from('billing_payments')
      .insert({
        schedule_id: data.scheduleId,
        client_id: data.clientId,
        company_id: data.companyId,
        amount: data.amount,
        payment_date: data.paymentDate,
        method: data.method,
        notes: data.notes?.trim() || null,
        source: 'manual',
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/dashboard/clients/${data.clientId}`)
    revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.scheduleId}`)

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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const billingCheck = await assertBillingEnabled(companyId)
    if (!billingCheck.ok) return { success: false, error: billingCheck.error }

    const schedule = await verifyScheduleOwnership(scheduleId, clientId)
    if (!schedule) return { success: false, error: 'Job not found' }

    const { error } = await supabaseAdmin
      .from('billing_payments')
      .delete()
      .eq('id', id)
      .eq('schedule_id', scheduleId)

    if (error) throw error

    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath(`/dashboard/clients/${clientId}/jobs/${scheduleId}`)

    return { success: true }
  } catch (error: any) {
    console.error('deleteBillingPaymentAction error:', error)
    return { success: false, error: error.message }
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

export async function getClientEstimatesAction(clientId: string) {
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
    const { data: documents, error } = await supabaseAdmin
      .from('client_documents')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return { success: true, documents: documents || [] }
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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    if (!(await verifyClientOwnership(data.clientId, data.companyId))) {
      return { success: false, error: 'Client not found' }
    }

    const { data: estimate, error } = await supabaseAdmin
      .from('estimates')
      .insert({
        client_id: data.clientId,
        company_id: data.companyId,
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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const estimate = await verifyEstimateOwnership(data.id, data.clientId)
    if (!estimate) return { success: false, error: 'Estimate not found' }

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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const estimate = await verifyEstimateOwnership(data.id, data.clientId)
    if (!estimate) return { success: false, error: 'Estimate not found' }
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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const estimate = await verifyEstimateOwnership(id, clientId)
    if (!estimate) return { success: false, error: 'Estimate not found' }
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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const estimate = await verifyEstimateOwnership(data.estimateId, data.clientId)
    if (!estimate) return { success: false, error: 'Estimate not found' }
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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const estimate = await verifyEstimateOwnership(data.estimateId, data.clientId)
    if (!estimate) return { success: false, error: 'Estimate not found' }
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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const estimate = await verifyEstimateOwnership(estimateId, clientId)
    if (!estimate) return { success: false, error: 'Estimate not found' }
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
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const estimate = await verifyEstimateOwnership(data.estimateId, data.clientId)
    if (!estimate) return { success: false, error: 'Estimate not found' }
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
          data.companyId,
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

    const stripeStatus = await getCompanyStripeStatus(data.companyId)
    if (stripeStatus.billingEnabled) {
      await seedBillingFromEstimate(
        supabaseAdmin,
        newSchedule.id,
        data.clientId,
        data.companyId,
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

export async function getClientPortalStatusAction(clientId: string) {
  try {
    const check = await verifyCompanyAdminForClient(clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { client } = check
    let profileEmail: string | null = null

    if (client.auth_user_id) {
      const supabaseAdmin = createSupabaseAdmin()
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('id', client.auth_user_id)
        .single()
      profileEmail = profile?.email ?? null
    }

    return {
      success: true,
      status: {
        portalEnabled: client.portal_enabled,
        portalInvitedAt: client.portal_invited_at,
        hasPortalUser: !!client.auth_user_id,
        portalUserEmail: profileEmail,
        clientEmail: client.email,
      },
    }
  } catch (error: any) {
    console.error('getClientPortalStatusAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function inviteClientToPortalAction(clientId: string, origin: string) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { client, companyId } = check
    if (!companyId) return { success: false, error: 'Company not found' }

    const email = client.email?.trim().toLowerCase()

    if (!email) {
      return { success: false, error: 'Add a client email before sending a portal invite' }
    }

    if (client.auth_user_id) {
      return { success: false, error: 'This client already has portal access. Revoke first to re-invite.' }
    }

    const emailCheck = await assertPortalEmailAvailable(supabaseAdmin, email, clientId)
    if (!emailCheck.ok) return { success: false, error: emailCheck.error }

    const orphanedProfile = await findProfileByClientId(supabaseAdmin, clientId)
    if (orphanedProfile) {
      await upsertClientPortalProfile(supabaseAdmin, {
        userId: orphanedProfile.id,
        fullName: client.name,
        email,
        companyId,
        clientId,
      })
      await linkClientPortalAccess(supabaseAdmin, clientId, orphanedProfile.id)
      revalidatePath(`/dashboard/clients/${clientId}`)
      return { success: true }
    }

    let authUserId: string

    const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, email)
    if (existingAuthUser) {
      authUserId = existingAuthUser.id
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
        email_confirm: true,
        user_metadata: {
          full_name: client.name,
          role: 'client',
          company_id: companyId,
          client_id: clientId,
        },
      })
      if (updateError) throw updateError
    } else {
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: `${origin}/login`,
          data: {
            full_name: client.name,
            role: 'client',
            company_id: companyId,
            client_id: clientId,
          },
        }
      )

      if (inviteError) throw inviteError
      if (!inviteData.user) throw new Error('Invite failed')
      authUserId = inviteData.user.id
    }

    await upsertClientPortalProfile(supabaseAdmin, {
      userId: authUserId,
      fullName: client.name,
      email,
      companyId,
      clientId,
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
}) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(data.clientId)
    if (!check.ok) return { success: false, error: check.error }

    const { client, companyId } = check
    if (!companyId) return { success: false, error: 'Company not found' }

    if (client.auth_user_id) {
      return { success: false, error: 'This client already has portal credentials' }
    }

    const email = data.email.trim().toLowerCase()
    if (!email || !data.password || data.password.length < 8) {
      return { success: false, error: 'Valid email and password (8+ characters) are required' }
    }

    const emailCheck = await assertPortalEmailAvailable(supabaseAdmin, email, data.clientId)
    if (!emailCheck.ok) return { success: false, error: emailCheck.error }

    const orphanedProfile = await findProfileByClientId(supabaseAdmin, data.clientId)
    if (orphanedProfile) {
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
        orphanedProfile.id,
        {
          email,
          password: data.password,
          email_confirm: true,
          user_metadata: {
            full_name: client.name,
            role: 'client',
            company_id: companyId,
            client_id: data.clientId,
          },
        }
      )
      if (passwordError) throw passwordError

      await upsertClientPortalProfile(supabaseAdmin, {
        userId: orphanedProfile.id,
        fullName: client.name,
        email,
        companyId,
        clientId: data.clientId,
      })
      await linkClientPortalAccess(supabaseAdmin, data.clientId, orphanedProfile.id, client.email || email)
      revalidatePath(`/dashboard/clients/${data.clientId}`)
      return { success: true }
    }

    let authUserId: string

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: client.name,
        role: 'client',
        company_id: companyId,
        client_id: data.clientId,
      },
    })

    if (authError && isEmailAlreadyRegisteredError(authError.message)) {
      const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, email)
      if (!existingAuthUser) throw authError

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          email,
          password: data.password,
          email_confirm: true,
          user_metadata: {
            full_name: client.name,
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
      fullName: client.name,
      email,
      companyId,
      clientId: data.clientId,
    })

    await linkClientPortalAccess(supabaseAdmin, data.clientId, authUserId, client.email || email)

    revalidatePath(`/dashboard/clients/${data.clientId}`)

    return { success: true }
  } catch (error: any) {
    console.error('createClientPortalUserAction error:', error)
    return { success: false, error: error.message }
  }
}

export async function setClientPortalEnabledAction(clientId: string, enabled: boolean) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(clientId)
    if (!check.ok) return { success: false, error: check.error }

    if (!check.client.auth_user_id) {
      return { success: false, error: 'Set up portal access first' }
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

export async function revokeClientPortalAccessAction(clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const check = await verifyCompanyAdminForClient(clientId)
    if (!check.ok) return { success: false, error: check.error }

    const authUserId = check.client.auth_user_id

    if (authUserId) {
      await supabaseAdmin.from('profiles').delete().eq('id', authUserId)
      await supabaseAdmin.auth.admin.deleteUser(authUserId)
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
    const session = await getSessionProfile()
    if (!session) {
      return { success: false as const, error: 'Not authenticated' }
    }

    const supabaseAdmin = createSupabaseAdmin()
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, role, company_id')
      .eq('id', session.userId)
      .single()

    if (profileError || !profile) {
      return { success: false as const, error: 'Profile not found' }
    }

    let company: { id: string; name: string; logo_url: string | null } | null = null
    if (profile.company_id) {
      const { data: companyData } = await supabaseAdmin
        .from('companies')
        .select('id, name, logo_url')
        .eq('id', profile.company_id)
        .single()
      company = companyData
    }

    return { success: true as const, profile, company }
  } catch (error: any) {
    console.error('getDashboardUserDataAction error:', error)
    return { success: false as const, error: error.message || 'Failed to load user data' }
  }
}

async function syncCompanyScheduleStatuses(companyId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const { data: clients } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('company_id', companyId)

  if (!clients?.length) return

  for (const client of clients) {
    await syncScheduleStatusesForClient(supabaseAdmin, client.id)
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
    await syncCompanyScheduleStatuses(companyId)

    const supabaseAdmin = createSupabaseAdmin()
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('timezone, business_hours_start, business_hours_end')
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Company not found' }
    }

    const timezone = company.timezone || 'America/Chicago'
    const businessHours = normalizeBusinessHours(
      company.business_hours_start,
      company.business_hours_end
    )
    const now = new Date()
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

    const timelineJobs = assignTimelineLanes(buildTimelineJobs(timelineSchedules, timezone, now))
    const crews = buildCrewSummaries(crewsData || [], todaySchedules, timezone, now)
    const laneCount = timelineJobs.reduce((max, job) => Math.max(max, job.lane + 1), 1)

    return {
      success: true,
      data: {
        timezone,
        businessHours,
        crews,
        jobs: timelineJobs,
        laneCount,
        timelineMode,
        timelineDateLabel: formatCompanyDateLabel(timezone, now, timelineDayOffset),
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
        address_street,
        address_unit,
        address_city,
        address_state,
        address_zip
      `)
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Company not found' }
    }

    const companyTimezone = company.timezone || timezone
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
          client:clients!client_id (name, address),
          crew:crews!crew_id (id, name)
        `)
        .in('client_id', clientIds)
        .neq('status', 'cancelled')
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

    const mapData = await buildDashboardMapData({
      companyName: company.name,
      companyAddress: company.address,
      companyStructuredAddress,
      crews: crewsData || [],
      schedules: todaySchedules,
      now,
    })

    return { success: true, data: mapData }
  } catch (error: any) {
    console.error('getDashboardMapDataAction error:', error)
    return { success: false, error: error.message || 'Failed to load map data' }
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
        address_zip
      `)
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Company not found' }
    }

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
          client:clients!client_id (id, name, address),
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
      crews: crewsData || [],
      schedules: todaySchedules,
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

export async function updateCompanySettingsAction(data: {
  timezone: string
  businessHours: BusinessHours
  companyAddress?: StructuredAddress
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

    const supabaseAdmin = createSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('companies')
      .update({
        timezone: data.timezone,
        business_hours_start: data.businessHours.start,
        business_hours_end: data.businessHours.end,
        address_street: normalizedAddress.street,
        address_unit: normalizedAddress.unit || null,
        address_city: normalizedAddress.city,
        address_state: normalizedAddress.state,
        address_zip: normalizedAddress.zip,
        address: formatAddressForDisplay(normalizedAddress),
      })
      .eq('id', session.profile.company_id)

    if (error) {
      return { success: false, error: error.message }
    }

    const geocodeResult = await geocodeStructuredAddress(normalizedAddress)

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/settings')

    return {
      success: true,
      mapReady: geocodeResult.success,
      mapWarning: geocodeResult.success
        ? undefined
        : geocodeResult.reason,
    }
  } catch (error: any) {
    console.error('updateCompanySettingsAction error:', error)
    return { success: false, error: error.message || 'Failed to save settings' }
  }
}
