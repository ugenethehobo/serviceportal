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
    const { error } = await supabaseAdmin.from('clients').insert({
      name: data.name,
      contact_name: data.contact_name || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
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
    if (data.address !== undefined) updateData.address = data.address || null
    if (data.notes !== undefined) updateData.notes = data.notes || null

    const { error } = await supabaseAdmin
      .from('clients')
      .update(updateData)
      .eq('id', data.id)

    if (error) throw error

    revalidatePath('/dashboard/clients')
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

export async function syncScheduleStatusesAction(clientId: string) {
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
    const now = new Date().toISOString()
    let activated = 0
    let archived = 0

    // 1. Activate jobs that should be running right now
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
        .in('id', toActivate.map(s => s.id))
      activated = toActivate.length
    }

    // 2. Archive ended jobs + generate next recurring instance
    const { data: toArchive } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .eq('client_id', clientId)
      .neq('status', 'archived')
      .lt('end_time', now)

    if (toArchive && toArchive.length > 0) {
      for (const schedule of toArchive) {
        // Archive current
        await supabaseAdmin
          .from('schedules')
          .update({ status: 'archived' })
          .eq('id', schedule.id)
        archived++

        // If this was a recurring job, create the next occurrence
        if (schedule.recurring_rule_id) {
          await generateNextRecurringInstance(schedule, supabaseAdmin)
        }
      }
    }

    revalidatePath(`/dashboard/clients/${clientId}`)

    return {
      success: true,
      activated,
      archived,
      message: `Activated: ${activated}, Archived: ${archived}`
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
