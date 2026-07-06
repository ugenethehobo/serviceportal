import type { SupabaseClient } from '@supabase/supabase-js'
import type { LeadActivity } from '@/lib/leads'

export async function insertLeadActivity(
  supabaseAdmin: SupabaseClient,
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