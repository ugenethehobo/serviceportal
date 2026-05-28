import { createClient } from '@/lib/supabase/server'
import { getCurrentSubscriptionStatus, type SubscriptionStatus } from './subscription'

export interface ActionCheck {
  allowed: boolean
  reason?: string
  status?: SubscriptionStatus
}

/**
 * Central authorization layer for the application.
 * This should be used before allowing paid or quota-based actions.
 */
export async function canUserPerformAction(action: 'create_client' | 'create_job' | 'create_estimate' | 'use_route_planner'): Promise<ActionCheck> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { allowed: false, reason: 'Not authenticated' }
  }

  const subscription = await getCurrentSubscriptionStatus()

  // If subscription is not active/trialing, block most actions
  if (!subscription.isActive) {
    let reason = 'Your subscription is not active.'

    if (subscription.status === 'past_due') {
      reason = 'Your payment is past due. Please update your billing information.'
    } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
      reason = 'Your subscription has been canceled. Please resubscribe to continue using the platform.'
    }

    return {
      allowed: false,
      reason,
      status: subscription.status,
    }
  }

  // For client creation, we have additional trial limits
  if (action === 'create_client') {
    // We already have detailed trial checking in lib/trial.ts
    // This is just a high-level gate
    return { allowed: true, status: subscription.status }
  }

  // For other actions, active/trialing is sufficient for now
  return { allowed: true, status: subscription.status }
}

/**
 * Throws an error if the user cannot perform the action.
 * Useful in server actions.
 */
export async function requireActionPermission(action: 'create_client' | 'create_job' | 'create_estimate' | 'use_route_planner') {
  const check = await canUserPerformAction(action)
  
  if (!check.allowed) {
    throw new Error(check.reason || 'Action not allowed due to subscription status.')
  }
}
