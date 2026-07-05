import { SOLO_CREW_NAME } from '@/lib/company-operations'
import { createSupabaseAdmin } from '@/lib/portal-auth'

export type CompanySoloContext = {
  isSoloBusiness: boolean
  soloCrewId: string | null
}

export async function getCompanySoloContext(
  companyId: string
): Promise<CompanySoloContext> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('is_solo_business')
    .eq('id', companyId)
    .single()

  const isSoloBusiness = Boolean(company?.is_solo_business)
  if (!isSoloBusiness) {
    return { isSoloBusiness: false, soloCrewId: null }
  }

  const soloCrewId = await resolveSoloCrewId(supabaseAdmin, companyId)
  return { isSoloBusiness: true, soloCrewId }
}

async function resolveSoloCrewId(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  companyId: string
): Promise<string | null> {
  const { data: admin } = await supabaseAdmin
    .from('profiles')
    .select('id, crew_id')
    .eq('company_id', companyId)
    .eq('role', 'company_admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (admin?.crew_id) {
    return admin.crew_id
  }

  const { data: crew } = await supabaseAdmin
    .from('crews')
    .select('id')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return crew?.id ?? null
}

export async function ensureSoloCrewForCompany(companyId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: admin, error: adminError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, crew_id')
    .eq('company_id', companyId)
    .eq('role', 'company_admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (adminError) {
    return { ok: false as const, error: adminError.message }
  }

  if (!admin) {
    return { ok: false as const, error: 'No company admin found for solo setup' }
  }

  let crewId = admin.crew_id

  if (!crewId) {
    const { data: existingCrew } = await supabaseAdmin
      .from('crews')
      .select('id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    crewId = existingCrew?.id ?? null
  }

  if (!crewId) {
    const { data: newCrew, error: crewError } = await supabaseAdmin
      .from('crews')
      .insert({
        name: SOLO_CREW_NAME,
        company_id: companyId,
        crew_lead_id: admin.id,
      })
      .select('id')
      .single()

    if (crewError || !newCrew) {
      return { ok: false as const, error: crewError?.message || 'Failed to create owner crew' }
    }

    crewId = newCrew.id
  } else {
    const { error: leadError } = await supabaseAdmin
      .from('crews')
      .update({ crew_lead_id: admin.id })
      .eq('id', crewId)

    if (leadError) {
      return { ok: false as const, error: leadError.message }
    }
  }

  if (admin.crew_id !== crewId) {
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ crew_id: crewId })
      .eq('id', admin.id)

    if (profileError) {
      return { ok: false as const, error: profileError.message }
    }
  }

  return { ok: true as const, crewId }
}