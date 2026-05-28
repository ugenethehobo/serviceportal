import { createClient } from '@/lib/supabase/server'

/**
 * Checks whether a company (belonging to the current user) can create another client
 * under the "first N clients free" trial model.
 */
export async function canCreateAnotherClient(): Promise<{ allowed: boolean; reason?: string; limit?: number; used?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { allowed: false, reason: 'Not authenticated' }
  }

  // Find the company this user owns (via company_users or owner_user_id)
  const { data: company } = await supabase
    .from('companies')
    .select('id, subscription_status, trial_clients_limit, trial_clients_used')
    .or(`owner_user_id.eq.${user.id},company_users.user_id.eq.${user.id}`)
    .limit(1)
    .single()

  if (!company) {
    // No company yet — allow (edge case during early onboarding)
    return { allowed: true }
  }

  // If they have a paid subscription, they can create unlimited clients
  if (company.subscription_status === 'active') {
    return { allowed: true }
  }

  const limit = company.trial_clients_limit ?? 3
  const used = company.trial_clients_used ?? 0

  if (used >= limit) {
    return {
      allowed: false,
      reason: `You have reached your free trial limit of ${limit} clients.`,
      limit,
      used,
    }
  }

  return { allowed: true, limit, used }
}

/**
 * Increments the trial client counter for a company after a successful client creation.
 * 
 * Note: This implementation has a small race condition risk under high concurrency.
 * For production at scale, create a Postgres function:
 * 
 * CREATE OR REPLACE FUNCTION increment_trial_clients_used(company_id uuid)
 * RETURNS void AS $$
 * BEGIN
 *   UPDATE companies 
 *   SET trial_clients_used = trial_clients_used + 1 
 *   WHERE id = company_id;
 * END;
 * $$ LANGUAGE plpgsql;
 */
export async function incrementTrialClientCount(companyId: string) {
  const supabase = await createClient()

  // Try RPC first (recommended for production)
  const { error } = await supabase.rpc('increment_trial_clients_used', {
    company_id: companyId,
  })

  if (error) {
    // Fallback: read-modify-write (acceptable for low volume)
    const { data: current } = await supabase
      .from('companies')
      .select('trial_clients_used')
      .eq('id', companyId)
      .single()

    const newCount = (current?.trial_clients_used ?? 0) + 1

    await supabase
      .from('companies')
      .update({ trial_clients_used: newCount })
      .eq('id', companyId)
  }
}
