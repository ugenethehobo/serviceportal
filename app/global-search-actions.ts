'use server'

import { groupGlobalSearchResults, toIlikePattern, type GlobalSearchResult } from '@/lib/global-search'
import {
  createSupabaseAdmin,
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'

const RESULT_LIMIT = 6
const MIN_REMOTE_QUERY_LENGTH = 2

async function verifyCompanyStaffForSearch() {
  const session = await getSessionProfile()
  if (!session) {
    return { ok: false as const, error: 'Not authenticated' }
  }
  if (!session.profile.company_id) {
    return { ok: false as const, error: 'No company associated with this account' }
  }
  if (!isStaffRole(session.profile.role)) {
    return { ok: false as const, error: 'Unauthorized' }
  }

  const subscription = await verifyStaffSubscriptionAccess(session.profile.company_id)
  if (!subscription.ok) {
    return { ok: false as const, error: TRIAL_EXPIRED_ERROR }
  }

  return {
    ok: true as const,
    companyId: session.profile.company_id,
    role: session.profile.role,
  }
}

function formatShortDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatCurrency(amount: number | null | undefined): string | undefined {
  if (amount == null || Number.isNaN(Number(amount))) return undefined
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(amount))
}

async function searchClients(
  companyId: string,
  pattern: string
): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, name, contact_name, email, address_city, address_state')
    .eq('company_id', companyId)
    .or(
      [
        `name.ilike.${pattern}`,
        `contact_name.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
        `address.ilike.${pattern}`,
        `address_street.ilike.${pattern}`,
        `address_city.ilike.${pattern}`,
        `address_state.ilike.${pattern}`,
        `address_zip.ilike.${pattern}`,
      ].join(',')
    )
    .order('name', { ascending: true })
    .limit(RESULT_LIMIT)

  if (error) throw error

  return (data ?? []).map((client) => ({
    id: client.id,
    type: 'client' as const,
    title: client.name,
    subtitle:
      [client.contact_name, client.email, [client.address_city, client.address_state].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(' · ') || 'Client',
    href: `/dashboard/clients/${client.id}`,
    group: 'Clients',
  }))
}

async function searchJobs(companyId: string, pattern: string): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('schedules')
    .select('id, title, start_time, client_id, clients!inner(id, name, company_id)')
    .eq('clients.company_id', companyId)
    .or(`title.ilike.${pattern},description.ilike.${pattern}`)
    .order('start_time', { ascending: false })
    .limit(RESULT_LIMIT)

  if (error) throw error

  return (data ?? []).map((job) => {
    const client = Array.isArray(job.clients) ? job.clients[0] : job.clients
    return {
      id: job.id,
      type: 'job' as const,
      title: job.title,
      subtitle: [client?.name, formatShortDate(job.start_time)].filter(Boolean).join(' · '),
      href: `/dashboard/clients/${job.client_id}/jobs/${job.id}`,
      group: 'Jobs',
    }
  })
}

async function searchLeads(companyId: string, pattern: string): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id, name, contact_name, status, source')
    .eq('company_id', companyId)
    .or(
      [
        `name.ilike.${pattern}`,
        `contact_name.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
        `notes.ilike.${pattern}`,
        `source.ilike.${pattern}`,
        `status.ilike.${pattern}`,
      ].join(',')
    )
    .order('updated_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (error) throw error

  return (data ?? []).map((lead) => ({
    id: lead.id,
    type: 'lead' as const,
    title: lead.name,
    subtitle: [lead.contact_name, lead.status, lead.source].filter(Boolean).join(' · '),
    href: `/dashboard/leads?lead=${lead.id}`,
    group: 'Leads',
  }))
}

async function loadCompanyCrewSearchMeta(companyId: string): Promise<{
  group: string
  singular: string
  isSoloBusiness: boolean
  crewLabel: string | null
}> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data } = await supabaseAdmin
    .from('companies')
    .select('crew_label, is_solo_business')
    .eq('id', companyId)
    .maybeSingle()

  const { getCrewsSearchGroupLabel, getCrewTerminology } = await import(
    '@/lib/crew-terminology'
  )
  const isSoloBusiness = Boolean(data?.is_solo_business)
  const crewLabel = (data?.crew_label as string | null | undefined) ?? null
  const terms = getCrewTerminology(crewLabel)
  return {
    group: getCrewsSearchGroupLabel(isSoloBusiness, crewLabel),
    singular: terms.singular,
    isSoloBusiness,
    crewLabel,
  }
}

async function searchCrews(companyId: string, pattern: string): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const [{ data, error }, meta] = await Promise.all([
    supabaseAdmin
      .from('crews')
      .select('id, name')
      .eq('company_id', companyId)
      .ilike('name', pattern)
      .order('name', { ascending: true })
      .limit(RESULT_LIMIT),
    loadCompanyCrewSearchMeta(companyId),
  ])

  if (error) throw error

  return (data ?? []).map((crew) => ({
    id: crew.id,
    type: 'crew' as const,
    title: crew.name,
    subtitle: meta.singular,
    href: '/dashboard/crews',
    group: meta.group,
  }))
}

async function searchTeamMembers(
  companyId: string,
  pattern: string
): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const [{ data, error }, meta] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('company_id', companyId)
      .in('role', ['company_admin', 'team_member'])
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .order('full_name', { ascending: true })
      .limit(RESULT_LIMIT),
    loadCompanyCrewSearchMeta(companyId),
  ])

  if (error) throw error

  return (data ?? []).map((member) => ({
    id: member.id,
    type: 'team' as const,
    title: member.full_name || member.email || 'Team member',
    subtitle: member.role === 'company_admin' ? 'Admin' : 'Team member',
    href: '/dashboard/crews',
    group: meta.group,
  }))
}

async function searchEstimates(
  companyId: string,
  pattern: string
): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('estimates')
    .select('id, title, status, total, client_id, clients!inner(id, name, company_id)')
    .eq('clients.company_id', companyId)
    .or(`title.ilike.${pattern},description.ilike.${pattern},status.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (error) throw error

  return (data ?? []).map((estimate) => {
    const client = Array.isArray(estimate.clients) ? estimate.clients[0] : estimate.clients
    return {
      id: estimate.id,
      type: 'estimate' as const,
      title: estimate.title,
      subtitle: [client?.name, estimate.status, formatCurrency(estimate.total)]
        .filter(Boolean)
        .join(' · '),
      href: `/dashboard/clients/${estimate.client_id}?tab=estimates`,
      group: 'Estimates',
    }
  })
}

async function searchDocuments(
  companyId: string,
  pattern: string
): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('client_documents')
    .select('id, name, file_name, category, source, client_id, clients!inner(id, name, company_id)')
    .eq('company_id', companyId)
    .eq('clients.company_id', companyId)
    .or(
      `name.ilike.${pattern},file_name.ilike.${pattern},category.ilike.${pattern},notes.ilike.${pattern},source.ilike.${pattern}`
    )
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (error) throw error

  return (data ?? []).map((document) => {
    const client = Array.isArray(document.clients) ? document.clients[0] : document.clients
    return {
      id: document.id,
      type: 'document' as const,
      title: document.name || document.file_name,
      subtitle: [client?.name, document.source, document.category].filter(Boolean).join(' · '),
      href: `/dashboard/clients/${document.client_id}?tab=documents`,
      group: 'Documents',
    }
  })
}

async function searchContracts(
  companyId: string,
  pattern: string
): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('contracts')
    .select('id, title, status, client_id, clients!inner(id, name, company_id)')
    .eq('company_id', companyId)
    .or(`title.ilike.${pattern},status.ilike.${pattern}`)
    .order('updated_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (error) throw error

  return (data ?? []).map((contract) => {
    const client = Array.isArray(contract.clients) ? contract.clients[0] : contract.clients
    return {
      id: contract.id,
      type: 'contract' as const,
      title: contract.title,
      subtitle: [client?.name, contract.status].filter(Boolean).join(' · '),
      href: `/dashboard/clients/${contract.client_id}?tab=documents`,
      group: 'Contracts',
    }
  })
}

async function searchContractTemplates(
  companyId: string,
  pattern: string
): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('contract_templates')
    .select('id, name')
    .eq('company_id', companyId)
    .ilike('name', pattern)
    .order('updated_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (error) throw error

  return (data ?? []).map((template) => ({
    id: template.id,
    type: 'contract_template' as const,
    title: template.name,
    subtitle: 'Contract template',
    href: '/dashboard/settings?section=contract-templates',
    group: 'Contracts',
  }))
}

async function searchPayments(
  companyId: string,
  pattern: string
): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('billing_payments')
    .select(
      'id, amount, payment_date, method, notes, client_id, schedule_id, client:clients!client_id (name), schedule:schedules!schedule_id (title)'
    )
    .eq('company_id', companyId)
    .or(`method.ilike.${pattern},notes.ilike.${pattern}`)
    .order('payment_date', { ascending: false })
    .limit(RESULT_LIMIT)

  if (error) throw error

  return (data ?? []).map((payment) => {
    const client = Array.isArray(payment.client) ? payment.client[0] : payment.client
    const schedule = Array.isArray(payment.schedule) ? payment.schedule[0] : payment.schedule
    const href =
      payment.client_id && payment.schedule_id
        ? `/dashboard/clients/${payment.client_id}/jobs/${payment.schedule_id}?tab=billing`
        : '/dashboard/payments'

    return {
      id: payment.id,
      type: 'payment' as const,
      title: schedule?.title || client?.name || 'Payment',
      subtitle: [formatCurrency(payment.amount), payment.method, formatShortDate(payment.payment_date)]
        .filter(Boolean)
        .join(' · '),
      href,
      group: 'Payments',
    }
  })
}

async function searchPhotos(
  companyId: string,
  pattern: string
): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('job_photos')
    .select('id, file_name, caption, category, client_id, schedule_id, clients!inner(id, name, company_id)')
    .eq('company_id', companyId)
    .eq('clients.company_id', companyId)
    .or(`file_name.ilike.${pattern},caption.ilike.${pattern},category.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (error) throw error

  return (data ?? []).map((photo) => {
    const client = Array.isArray(photo.clients) ? photo.clients[0] : photo.clients
    const href = photo.schedule_id
      ? `/dashboard/clients/${photo.client_id}/jobs/${photo.schedule_id}`
      : `/dashboard/clients/${photo.client_id}?tab=photos`

    return {
      id: photo.id,
      type: 'photo' as const,
      title: photo.caption || photo.file_name,
      subtitle: [client?.name, photo.category].filter(Boolean).join(' · '),
      href,
      group: 'Photos',
    }
  })
}

async function searchServicePackages(
  companyId: string,
  pattern: string
): Promise<GlobalSearchResult[]> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('bookable_services')
    .select('id, name, description')
    .eq('company_id', companyId)
    .or(`name.ilike.${pattern},description.ilike.${pattern}`)
    .order('name', { ascending: true })
    .limit(RESULT_LIMIT)

  if (error) throw error

  return (data ?? []).map((service) => ({
    id: service.id,
    type: 'service_package' as const,
    title: service.name,
    subtitle: 'Service package',
    href: '/dashboard/settings?section=service-packages',
    group: 'Service packages',
  }))
}

async function safeRemoteSearch(
  label: string,
  fn: () => Promise<GlobalSearchResult[]>
): Promise<GlobalSearchResult[]> {
  try {
    return await fn()
  } catch (error) {
    console.error(`globalSearchAction ${label} error:`, error)
    return []
  }
}

export async function globalSearchAction(query: string) {
  try {
    const check = await verifyCompanyStaffForSearch()
    if (!check.ok) {
      return { success: false as const, error: check.error }
    }

    const trimmed = query.trim()
    if (!trimmed) {
      return { success: true as const, results: [] as GlobalSearchResult[] }
    }

    const isAdmin = check.role === 'company_admin'

    if (trimmed.length < MIN_REMOTE_QUERY_LENGTH) {
      return { success: true as const, results: [] as GlobalSearchResult[] }
    }

    const pattern = toIlikePattern(trimmed)
    const remoteTasks: Array<Promise<GlobalSearchResult[]>> = [
      safeRemoteSearch('clients', () => searchClients(check.companyId, pattern)),
      safeRemoteSearch('jobs', () => searchJobs(check.companyId, pattern)),
      safeRemoteSearch('leads', () => searchLeads(check.companyId, pattern)),
      safeRemoteSearch('crews', () => searchCrews(check.companyId, pattern)),
      safeRemoteSearch('team', () => searchTeamMembers(check.companyId, pattern)),
      safeRemoteSearch('estimates', () => searchEstimates(check.companyId, pattern)),
      safeRemoteSearch('documents', () => searchDocuments(check.companyId, pattern)),
      safeRemoteSearch('contracts', () => searchContracts(check.companyId, pattern)),
      safeRemoteSearch('photos', () => searchPhotos(check.companyId, pattern)),
    ]

    if (isAdmin) {
      remoteTasks.push(
        safeRemoteSearch('payments', () => searchPayments(check.companyId, pattern)),
        safeRemoteSearch('contract_templates', () =>
          searchContractTemplates(check.companyId, pattern)
        ),
        safeRemoteSearch('service_packages', () =>
          searchServicePackages(check.companyId, pattern)
        )
      )
    }

    const [remoteChunks, meta] = await Promise.all([
      Promise.all(remoteTasks),
      loadCompanyCrewSearchMeta(check.companyId),
    ])
    const remoteResults = remoteChunks.flat()
    const { getGlobalSearchGroupOrder } = await import('@/lib/global-search')
    const groupOrder = getGlobalSearchGroupOrder(
      meta.isSoloBusiness,
      meta.crewLabel
    )

    return {
      success: true as const,
      results: groupGlobalSearchResults(remoteResults, groupOrder),
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Search failed'
    console.error('globalSearchAction error:', error)
    return { success: false as const, error: message }
  }
}