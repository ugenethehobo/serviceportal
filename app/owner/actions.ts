'use server'

import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'
import { revalidatePath } from 'next/cache'
import { isCurrentUserOwner } from '@/lib/authorization'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function deleteCompanyAsOwner(companyId: string) {
  const isOwner = await isCurrentUserOwner()
  if (!isOwner) {
    throw new Error('Unauthorized')
  }

  const supabase = await createClient()

  // Get company details first
  const { data: company, error: companyFetchError } = await supabase
    .from('companies')
    .select('id, name, stripe_customer_id, owner_user_id')
    .eq('id', companyId)
    .single()

  if (companyFetchError || !company) {
    throw new Error('Company not found')
  }

  console.log(`[Owner Delete] Starting deletion for company: ${company.name} (${companyId})`)

  // 1. Cancel any active Stripe subscriptions
  if (company.stripe_customer_id) {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: company.stripe_customer_id,
        status: 'all',
        limit: 10,
      })

      for (const sub of subscriptions.data) {
        if (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due') {
          await stripe.subscriptions.cancel(sub.id, {
            prorate: true,
          })
          console.log(`[Owner Delete] Canceled Stripe subscription: ${sub.id}`)
        }
      }

      // Optionally delete the customer (good for testing)
      try {
        await stripe.customers.del(company.stripe_customer_id)
        console.log(`[Owner Delete] Deleted Stripe customer: ${company.stripe_customer_id}`)
      } catch (stripeErr: any) {
        console.warn('[Owner Delete] Could not delete Stripe customer:', stripeErr.message)
      }
    } catch (err: any) {
      console.error('[Owner Delete] Stripe error:', err.message)
      // Continue with DB deletion even if Stripe fails
    }
  }

  // 2. Delete related records (order matters for FK constraints)
  const tablesToClean = [
    'company_settings',
    'subscriptions',
    'company_users',
    'onboarding_intakes',
    'portal_tokens',
    'leads',
    'estimates',
    'contracts',
    'messages',
    'files',
    'bills',
    'jobs',
    'clients',
  ]

  for (const table of tablesToClean) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('company_id', companyId)

      if (error && !error.message.includes('does not exist')) {
        console.warn(`[Owner Delete] Error cleaning ${table}:`, error.message)
      }
    } catch (err) {
      // Table might not exist or have different column name — continue
    }
  }

  // 3. Delete the company itself
  const { error: deleteCompanyError } = await supabase
    .from('companies')
    .delete()
    .eq('id', companyId)

  if (deleteCompanyError) {
    console.error('[Owner Delete] Failed to delete company:', deleteCompanyError)
    throw new Error('Failed to delete company record')
  }

  // 4. Delete the Supabase Auth user (if they have one)
  if (company.owner_user_id) {
    try {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(company.owner_user_id)
      if (authDeleteError) {
        console.warn('[Owner Delete] Could not delete auth user:', authDeleteError.message)
      } else {
        console.log(`[Owner Delete] Deleted auth user: ${company.owner_user_id}`)
      }
    } catch (err: any) {
      console.warn('[Owner Delete] Auth user deletion error:', err.message)
    }
  }

  console.log(`[Owner Delete] Successfully deleted company: ${company.name} (${companyId})`)

  revalidatePath('/owner')

  return { success: true, message: `Deleted ${company.name}` }
}
