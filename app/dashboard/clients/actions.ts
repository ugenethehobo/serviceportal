'use server'

import { createClient } from '@/lib/supabase/server'
import { canCreateAnotherClient, incrementTrialClientCount } from '@/lib/trial'
import { getCurrentSubscriptionStatus } from '@/lib/subscription'
import { revalidatePath } from 'next/cache'

export async function getSubscriptionStatusAction() {
  return await getCurrentSubscriptionStatus()
}

export async function createClientAction(formData: {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  notes?: string | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Owners have unrestricted access — skip all subscription/trial checks
  const ownerEmails = (process.env.OWNER_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  const isOwner = ownerEmails.includes(user.email?.toLowerCase() || '')

  let subStatus: any = { isActive: true, status: 'active' }
  let trialCheck: { allowed: boolean; reason?: string } = { allowed: true }

  if (!isOwner) {
    // Check subscription health first (non-owners only)
    subStatus = await getCurrentSubscriptionStatus()
    if (!subStatus.isActive) {
      let message = 'Your subscription is not active. Please update your billing to continue adding clients.'

      if (subStatus.status === 'past_due') {
        message = 'Your payment is past due. Please update your payment method to add more clients.'
      } else if (subStatus.status === 'canceled' || subStatus.status === 'unpaid') {
        message = 'Your subscription has been canceled. Please resubscribe to continue.'
      }

      return {
        success: false,
        error: message,
      }
    }

    // Then check trial limits (if still on trial)
    trialCheck = await canCreateAnotherClient()
    if (!trialCheck.allowed) {
      return {
        success: false,
        error: trialCheck.reason || 'Trial limit reached',
        trialInfo: trialCheck,
      }
    }
  }

  // Get the user's company
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .or(`owner_user_id.eq.${user.id},company_users.user_id.eq.${user.id}`)
    .limit(1)
    .single()

  const { error } = await supabase.from('clients').insert([{
    ...formData,
    user_id: user.id,
    company_id: company?.id,
  }])

  if (error) {
    return { success: false, error: error.message }
  }

  // Only increment trial count for non-owners who are still trialing
  if (!isOwner && company?.id && subStatus.status === 'trialing') {
    await incrementTrialClientCount(company.id)
  }

  revalidatePath('/dashboard/clients')
  return { success: true }
}
