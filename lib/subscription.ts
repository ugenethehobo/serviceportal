import { createClient } from '@/lib/supabase/server'

/** Pure helper — no Supabase call */
function getOwnerEmails(): string[] {
  return (process.env.OWNER_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

export type SubscriptionStatus = 
  | 'active' 
  | 'trialing' 
  | 'past_due' 
  | 'canceled' 
  | 'unpaid' 
  | 'unknown'

export interface SubscriptionInfo {
  status: SubscriptionStatus
  isActive: boolean           // active or trialing
  isPastDue: boolean
  isCanceled: boolean
  plan?: string | null
}

/**
 * Returns the current company's subscription status for the logged in user.
 * This is the source of truth for gating features.
 */
export async function getCurrentSubscriptionStatus(): Promise<SubscriptionInfo> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { status: 'unknown', isActive: false, isPastDue: false, isCanceled: false }
  }

  // Owners get full access regardless of any company's subscription state
  const ownerEmails = getOwnerEmails()
  if (ownerEmails.includes(user.email?.toLowerCase() || '')) {
    return {
      status: 'active',
      isActive: true,
      isPastDue: false,
      isCanceled: false,
      plan: 'owner',
    }
  }

  const { data: company } = await supabase
    .from('companies')
    .select(`
      subscription_status,
      subscriptions ( plan )
    `)
    .or(`owner_user_id.eq.${user.id},company_users.user_id.eq.${user.id}`)
    .limit(1)
    .single()

  if (!company) {
    return { status: 'unknown', isActive: false, isPastDue: false, isCanceled: false }
  }

  const status = (company.subscription_status || 'unknown') as SubscriptionStatus

  return {
    status,
    isActive: status === 'active' || status === 'trialing',
    isPastDue: status === 'past_due',
    isCanceled: status === 'canceled' || status === 'unpaid',
    plan: company.subscriptions?.[0]?.plan ?? null,
  }
}

/**
 * Returns true if the user should be allowed to perform paid actions.
 * Currently: active or trialing (with the 3-client limit handled separately).
 */
export async function canPerformPaidActions(): Promise<boolean> {
  const status = await getCurrentSubscriptionStatus()
  return status.isActive
}
