'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdmin, resolvePortalSession } from '@/lib/portal-auth'
import { getDisplayAddressFromClient } from '@/lib/address'
import { calcBillingSummary, formatCurrency } from '@/lib/billing'
import { buildPortalActivity } from '@/lib/portal-activity'
import {
  buildPortalBillingOverview,
  buildPortalJobBillingFields,
  isJobBillableForClient,
  partitionPortalJobs,
  sumBillableBalanceDue,
  toPayableJobRows,
  type PortalCrewMember,
  type PortalJob,
} from '@/lib/portal-jobs'
import { syncEstimateDocument } from '@/lib/estimates-server'
import { validateMessageBody, type MessagingMessage } from '@/lib/messaging'
import { normalizeJobPhotoCategories } from '@/lib/job-photo-categories'
import { JOB_PHOTO_BUCKET, type JobPhoto, type JobPhotoWithUrl } from '@/lib/job-photos'
import {
  normalizeUploadedDocumentRows,
  type UploadedDocument,
} from '@/lib/uploaded-documents'
import {
  notifyStaffEstimateResponse,
  notifyStaffMessageFromClient,
  queueNotification,
} from '@/lib/notifications-server'
import {
  getOrCreateMessagingThread,
  insertMessagingMessage,
  listMessagingMessages,
} from '@/lib/messaging-server'

async function requirePortalClient() {
  const portal = await resolvePortalSession()
  if (!portal) throw new Error('Unauthorized')

  // Real clients require portal enabled; staff preview can view disabled portals too.
  if (!portal.isPreview && !portal.portalEnabled) {
    throw new Error('Portal access disabled')
  }

  return {
    profile: portal.profile,
    clientId: portal.clientId,
    companyId: portal.companyId,
    isPreview: portal.isPreview,
  }
}

async function requirePortalClientWrite() {
  const portal = await requirePortalClient()
  if (portal.isPreview) {
    throw new Error('Actions are disabled while previewing the portal as staff')
  }
  return portal
}

async function getPortalCompanyTimezone(companyId: string) {
  const meta = await getPortalCompanyMeta(companyId)
  return meta.timezone
}

async function getPortalCompanyMeta(companyId: string) {
  const admin = createSupabaseAdmin()
  const { data: company } = await admin
    .from('companies')
    .select('timezone, crew_label')
    .eq('id', companyId)
    .single()

  const { normalizeCrewLabel } = await import('@/lib/crew-terminology')

  return {
    timezone: company?.timezone || 'America/Chicago',
    crewLabel: normalizeCrewLabel(
      (company as { crew_label?: string | null } | null)?.crew_label
    ),
  }
}

async function getPortalClientAddress(clientId: string) {
  const admin = createSupabaseAdmin()
  const { data: client } = await admin
    .from('clients')
    .select(
      'address, address_street, address_unit, address_city, address_state, address_zip'
    )
    .eq('id', clientId)
    .single()

  if (!client) return ''
  return getDisplayAddressFromClient(client) || ''
}

function mapScheduleToPortalJob(
  schedule: {
    id: string
    title: string
    description?: string | null
    start_time: string
    end_time: string
    status: string
    price: number | null
    crew?: { id: string; name: string } | { id: string; name: string }[] | null
  },
  lineItems: { schedule_id: string; amount: number }[],
  payments: { schedule_id: string; amount: number }[],
  serviceAddress: string,
  now = new Date()
): PortalJob {
  const lines = lineItems.filter((l) => l.schedule_id === schedule.id)
  const pays = payments.filter((p) => p.schedule_id === schedule.id)
  const summary = calcBillingSummary(lines, pays)
  const crew = Array.isArray(schedule.crew) ? schedule.crew[0] : schedule.crew
  const scheduleShape = {
    status: schedule.status,
    startTime: schedule.start_time,
    endTime: schedule.end_time,
    title: schedule.title,
    description: schedule.description ?? null,
    price: schedule.price || 0,
    id: schedule.id,
    crew: crew ? { id: crew.id, name: crew.name } : null,
    serviceAddress,
  }
  const billable = isJobBillableForClient(scheduleShape, now)
  const billingFields = buildPortalJobBillingFields(summary, lines.length, billable)

  return {
    ...scheduleShape,
    ...billingFields,
  }
}

async function attachCrewDetailsToJobs(
  admin: ReturnType<typeof createSupabaseAdmin>,
  jobs: PortalJob[],
  companyId: string
): Promise<PortalJob[]> {
  const crewIds = [
    ...new Set(jobs.map((job) => job.crew?.id).filter((id): id is string => Boolean(id))),
  ]
  if (crewIds.length === 0) return jobs

  const [{ data: crews }, { data: profiles }] = await Promise.all([
    admin.from('crews').select('id, name, crew_lead_id').in('id', crewIds),
    admin
      .from('profiles')
      .select('id, full_name, avatar_url, crew_id')
      .eq('company_id', companyId)
      .in('crew_id', crewIds)
      .neq('role', 'client'),
  ])

  const leadByCrew = new Map(
    (crews || []).map((crew) => [crew.id as string, (crew.crew_lead_id as string | null) ?? null])
  )
  const membersByCrew = new Map<string, PortalCrewMember[]>()

  for (const profile of profiles || []) {
    const crewId = profile.crew_id as string | null
    if (!crewId) continue
    const leadId = leadByCrew.get(crewId) ?? null
    const member: PortalCrewMember = {
      id: profile.id as string,
      fullName: (profile.full_name as string | null)?.trim() || 'Team member',
      avatarUrl: (profile.avatar_url as string | null) ?? null,
      isLead: Boolean(leadId && profile.id === leadId),
    }
    const list = membersByCrew.get(crewId) || []
    list.push(member)
    membersByCrew.set(crewId, list)
  }

  for (const [crewId, members] of membersByCrew) {
    members.sort((a, b) => {
      if (a.isLead !== b.isLead) return a.isLead ? -1 : 1
      return a.fullName.localeCompare(b.fullName)
    })
    membersByCrew.set(crewId, members)
  }

  return jobs.map((job) => {
    if (!job.crew) return job
    return {
      ...job,
      crew: {
        ...job.crew,
        leadId: leadByCrew.get(job.crew.id) ?? null,
        members: membersByCrew.get(job.crew.id) || [],
      },
    }
  })
}

async function fetchPortalJobsForClient(
  clientId: string,
  companyId?: string
): Promise<PortalJob[]> {
  const admin = createSupabaseAdmin()

  const { data: schedules, error } = await admin
    .from('schedules')
    .select(
      `
      id,
      title,
      description,
      start_time,
      end_time,
      status,
      price,
      crew:crews!crew_id (id, name)
    `
    )
    .eq('client_id', clientId)
    .order('start_time', { ascending: true })

  if (error) throw error

  const jobs = schedules || []
  const scheduleIds = jobs.map((j) => j.id)
  const serviceAddress = await getPortalClientAddress(clientId)

  let lineItems: { schedule_id: string; amount: number }[] = []
  let payments: { schedule_id: string; amount: number }[] = []

  if (scheduleIds.length > 0) {
    const [{ data: lines }, { data: pays }] = await Promise.all([
      admin.from('billing_line_items').select('schedule_id, amount').in('schedule_id', scheduleIds),
      admin.from('billing_payments').select('schedule_id, amount').in('schedule_id', scheduleIds),
    ])

    lineItems = lines || []
    payments = pays || []
  }

  const now = new Date()
  const { loadJobPaymentPlanProgress } = await import('@/lib/payment-plans-server')

  const mapped = await Promise.all(
    jobs.map(async (job) => {
      const base = mapScheduleToPortalJob(job, lineItems, payments, serviceAddress, now)
      try {
        const plan = await loadJobPaymentPlanProgress(admin, job.id, {
          status: job.status,
          startTime: job.start_time,
        })
        if (!plan) return base
        const lines = lineItems.filter((l) => l.schedule_id === job.id)
        const pays = payments.filter((p) => p.schedule_id === job.id)
        const summary = calcBillingSummary(lines, pays)
        const billable = isJobBillableForClient(
          { status: job.status, startTime: job.start_time },
          now
        )
        const fields = buildPortalJobBillingFields(summary, lines.length, billable, plan)
        return { ...base, ...fields }
      } catch {
        return base
      }
    })
  )

  if (!companyId) return mapped
  return attachCrewDetailsToJobs(admin, mapped, companyId)
}

export async function getPortalHomeData() {
  const { clientId, companyId } = await requirePortalClient()
  // clientId exposed to client for payment flows (portal session only)
  const admin = createSupabaseAdmin()
  const { timezone, crewLabel } = await getPortalCompanyMeta(companyId)
  const jobs = await fetchPortalJobsForClient(clientId, companyId)
  const now = new Date()
  const { activeNow, comingUp } = partitionPortalJobs(jobs, now)

  const balanceDue = sumBillableBalanceDue(jobs)

  const [
    { data: estimates },
    { data: allLineItems },
    { data: recentPayments },
    { data: scheduleRows },
    { data: contracts },
  ] = await Promise.all([
    admin
      .from('estimates')
      .select('id, title, total, status, updated_at')
      .eq('client_id', clientId)
      .in('status', ['sent', 'accepted', 'declined', 'converted']),
    admin
      .from('billing_line_items')
      .select('schedule_id, created_at')
      .eq('client_id', clientId),
    admin
      .from('billing_payments')
      .select('id, schedule_id, amount, payment_date, created_at, source')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('schedules')
      .select('id, title, status, start_time')
      .eq('client_id', clientId),
    admin
      .from('contracts')
      .select('id, title, status, sent_at, updated_at, client_signed_at')
      .eq('client_id', clientId)
      .in('status', ['ready_for_signing', 'signed'])
      .order('updated_at', { ascending: false })
      .limit(50),
  ])

  const schedulesById = new Map(
    (scheduleRows || []).map((row) => [row.id, row])
  )

  const activity = buildPortalActivity({
    timezone,
    estimates: estimates || [],
    contracts: contracts || [],
    jobs,
    payments: recentPayments || [],
    lineItems: allLineItems || [],
    schedulesById,
    crewLabel,
    now,
  })

  const payableJobs = toPayableJobRows(jobs)
  const billingOverview = buildPortalBillingOverview(
    jobs,
    recentPayments || [],
    schedulesById
  )

  return {
    clientId,
    timezone,
    activeJobs: activeNow,
    upcomingJobs: comingUp,
    upcomingJobCount: activeNow.length + comingUp.length,
    balanceDue,
    balanceDueFormatted: formatCurrency(balanceDue),
    payableJobs,
    activity,
    billingOverview,
  }
}

export async function getPortalJobsAction() {
  const { clientId, companyId } = await requirePortalClient()
  const jobs = await fetchPortalJobsForClient(clientId, companyId)
  const timezone = await getPortalCompanyTimezone(companyId)

  return { jobs, timezone }
}

export async function getPortalJobBillingAction(scheduleId: string) {
  const { clientId, companyId } = await requirePortalClient()
  const admin = createSupabaseAdmin()

  const [{ data: schedule }, serviceAddress, timezone] = await Promise.all([
    admin
      .from('schedules')
      .select(
        `
        id,
        title,
        description,
        start_time,
        end_time,
        status,
        price,
        client_id,
        crew:crews!crew_id (id, name)
      `
      )
      .eq('id', scheduleId)
      .eq('client_id', clientId)
      .single(),
    getPortalClientAddress(clientId),
    getPortalCompanyTimezone(companyId),
  ])

  if (!schedule) return { success: false as const, error: 'Job not found' }

  const { data: lineItems, error: lineError } = await admin
    .from('billing_line_items')
    .select('*')
    .eq('schedule_id', scheduleId)
    .order('created_at', { ascending: true })

  if (lineError) throw lineError

  const { data: payments, error: paymentError } = await admin
    .from('billing_payments')
    .select('*')
    .eq('schedule_id', scheduleId)
    .order('payment_date', { ascending: false })

  if (paymentError) throw paymentError

  const summary = calcBillingSummary(lineItems || [], payments || [])
  const crew = Array.isArray((schedule as any).crew)
    ? (schedule as any).crew[0]
    : (schedule as any).crew
  const billable = isJobBillableForClient(
    { status: schedule.status, startTime: schedule.start_time },
    new Date()
  )

  let plan = null as Awaited<
    ReturnType<
      typeof import('@/lib/payment-plans-server').loadJobPaymentPlanProgress
    >
  >
  try {
    const { loadJobPaymentPlanProgress } = await import('@/lib/payment-plans-server')
    plan = await loadJobPaymentPlanProgress(admin, scheduleId, {
      status: schedule.status,
      startTime: schedule.start_time,
    })
  } catch (error) {
    console.error('getPortalJobBilling plan load error:', error)
  }

  const billingFields = buildPortalJobBillingFields(
    summary,
    lineItems?.length ?? 0,
    billable,
    plan
  )

  return {
    success: true as const,
    billing: {
      scheduleId: schedule.id,
      title: schedule.title,
      description: schedule.description,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      status: schedule.status,
      listPrice: schedule.price || 0,
      lineItems: lineItems || [],
      payments: payments || [],
      // Ledger balance always truthful (K10)
      summary: {
        totalCharged: summary.totalCharged,
        totalPaid: summary.totalPaid,
        balanceDue: summary.balanceDue,
      },
      amountDueNow: billingFields.amountDueNow,
      maxPayableNow: billingFields.maxPayableNow,
      canPay: billingFields.canPay,
      isBillable: billable,
      lockPortalToDueNow: billingFields.lockPortalToDueNow ?? false,
      allowPayAhead: billingFields.allowPayAhead ?? true,
      installments: billingFields.installments || [],
      crew: crew ? { id: crew.id, name: crew.name } : null,
      serviceAddress,
    },
    clientId,
    timezone,
  }
}

export async function respondToEstimateAction(
  estimateId: string,
  response: 'accepted' | 'declined'
) {
  const { clientId } = await requirePortalClientWrite()
  const admin = createSupabaseAdmin()

  const { data: estimate } = await admin
    .from('estimates')
    .select('id, status, title, company_id')
    .eq('id', estimateId)
    .eq('client_id', clientId)
    .single()

  if (!estimate) return { success: false as const, error: 'Estimate not found' }
  if (estimate.status === 'converted') {
    return { success: false as const, error: 'This estimate has already been converted to a job' }
  }
  if (estimate.status !== 'sent') {
    return { success: false as const, error: 'This estimate is no longer awaiting your response' }
  }

  const { error } = await admin
    .from('estimates')
    .update({
      status: response,
      updated_at: new Date().toISOString(),
    })
    .eq('id', estimateId)

  if (error) throw error

  await syncEstimateDocument(estimateId)
  revalidatePath('/portal/estimates')
  revalidatePath(`/dashboard/clients/${clientId}`)

  void queueNotification(admin, async (notificationAdmin) => {
    const [{ data: client }, { data: company }] = await Promise.all([
      notificationAdmin.from('clients').select('name').eq('id', clientId).single(),
      notificationAdmin
        .from('companies')
        .select('name')
        .eq('id', estimate.company_id)
        .single(),
    ])

    await notifyStaffEstimateResponse(notificationAdmin, {
      companyId: estimate.company_id,
      companyName: company?.name,
      clientName: client?.name,
      estimateTitle: estimate.title,
      response,
      clientId,
      estimateId,
    })
  })

  return { success: true as const, status: response }
}

export async function getPortalMessagingThreadAction(): Promise<
  | { success: true; messages: MessagingMessage[] }
  | { success: false; error: string }
> {
  try {
    const { clientId, companyId } = await requirePortalClient()
    const admin = createSupabaseAdmin()

    const thread = await getOrCreateMessagingThread(admin, {
      companyId,
      clientId,
      scheduleId: null,
    })

    const messages = await listMessagingMessages(admin, thread.id)
    return { success: true, messages }
  } catch (error: any) {
    console.error('getPortalMessagingThreadAction error:', error)
    return { success: false, error: error.message || 'Failed to load messages' }
  }
}

export async function sendPortalMessagingMessageAction(
  body: string
): Promise<
  | { success: true; message: MessagingMessage }
  | { success: false; error: string }
> {
  try {
    const validation = validateMessageBody(body)
    if (!validation.ok) {
      return { success: false, error: validation.error }
    }

    const { clientId, companyId, profile } = await requirePortalClientWrite()
    const admin = createSupabaseAdmin()

    const { data: client } = await admin
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .single()

    const thread = await getOrCreateMessagingThread(admin, {
      companyId,
      clientId,
      scheduleId: null,
    })

    const message = await insertMessagingMessage(admin, {
      threadId: thread.id,
      companyId,
      senderUserId: profile.id,
      senderRole: 'client',
      senderName: client?.name?.trim() || profile.full_name?.trim() || 'Client',
      body: validation.body,
    })

    revalidatePath('/portal/messages')
    revalidatePath(`/dashboard/clients/${clientId}`)

    void queueNotification(admin, async (notificationAdmin) => {
      const { data: company } = await notificationAdmin
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single()

      await notifyStaffMessageFromClient(notificationAdmin, {
        companyId,
        companyName: company?.name,
        clientName: client?.name,
        messagePreview: validation.body,
        clientId,
      })
    })

    return { success: true, message }
  } catch (error: any) {
    console.error('sendPortalMessagingMessageAction error:', error)
    return { success: false, error: error.message || 'Failed to send message' }
  }
}

export async function getPortalDocumentsPageDataAction(): Promise<
  | {
      success: true
      documents: UploadedDocument[]
      jobs: Array<{ id: string; title: string; start_time: string; status: string }>
    }
  | { success: false; error: string }
> {
  try {
    const { clientId } = await requirePortalClient()
    const admin = createSupabaseAdmin()

    const [documentsResult, jobsResult] = await Promise.all([
      admin
        .from('client_documents')
        .select('*, contract:contracts!contract_id (status)')
        .eq('client_id', clientId)
        .in('source', ['upload', 'estimate', 'invoice', 'contract'])
        .order('created_at', { ascending: false }),
      admin
        .from('schedules')
        .select('id, title, start_time, status')
        .eq('client_id', clientId)
        .order('start_time', { ascending: false }),
    ])

    if (documentsResult.error) {
      if (documentsResult.error.code === '42703') {
        return { success: true, documents: [], jobs: jobsResult.data || [] }
      }
      throw documentsResult.error
    }
    if (jobsResult.error) throw jobsResult.error

    return {
      success: true,
      documents: normalizeUploadedDocumentRows(
        (documentsResult.data || []) as Parameters<typeof normalizeUploadedDocumentRows>[0]
      ),
      jobs: jobsResult.data || [],
    }
  } catch (error: any) {
    console.error('getPortalDocumentsPageDataAction error:', error)
    return { success: false, error: error.message || 'Failed to load documents' }
  }
}

export async function getPortalClientJobsForDocumentsAction(): Promise<
  | { success: true; jobs: Array<{ id: string; title: string; start_time: string; status: string }> }
  | { success: false; error: string }
> {
  try {
    const { clientId } = await requirePortalClient()
    const admin = createSupabaseAdmin()

    const { data: jobs, error } = await admin
      .from('schedules')
      .select('id, title, start_time, status')
      .eq('client_id', clientId)
      .order('start_time', { ascending: false })

    if (error) throw error
    return { success: true, jobs: jobs || [] }
  } catch (error: any) {
    console.error('getPortalClientJobsForDocumentsAction error:', error)
    return { success: false, error: error.message || 'Failed to load jobs' }
  }
}

export async function getPortalUploadedDocumentsAction(): Promise<
  { success: true; documents: UploadedDocument[] } | { success: false; error: string }
> {
  try {
    const { clientId } = await requirePortalClient()
    const admin = createSupabaseAdmin()

    const { data: documents, error } = await admin
      .from('client_documents')
      .select('*, contract:contracts!contract_id (status)')
      .eq('client_id', clientId)
      .in('source', ['upload', 'estimate', 'invoice', 'contract'])
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42703') {
        return { success: true, documents: [] }
      }
      throw error
    }

    return {
      success: true,
      documents: normalizeUploadedDocumentRows((documents || []) as Parameters<typeof normalizeUploadedDocumentRows>[0]),
    }
  } catch (error: any) {
    console.error('getPortalUploadedDocumentsAction error:', error)
    return { success: false, error: error.message || 'Failed to load documents' }
  }
}

async function attachPortalPhotoUrls(
  admin: ReturnType<typeof createSupabaseAdmin>,
  photos: JobPhoto[]
): Promise<JobPhotoWithUrl[]> {
  const withUrls: JobPhotoWithUrl[] = []

  for (const photo of photos) {
    const { data: signed, error: signedError } = await admin.storage
      .from(JOB_PHOTO_BUCKET)
      .createSignedUrl(photo.storage_path, 60 * 60)

    if (signedError || !signed?.signedUrl) continue
    withUrls.push({ ...photo, url: signed.signedUrl })
  }

  return withUrls
}

export async function getPortalPhotosPageDataAction(options?: {
  scheduleId?: string | null
}): Promise<
  | {
      success: true
      photos: JobPhotoWithUrl[]
      jobs: Array<{ id: string; title: string; start_time: string; status: string }>
      categories: string[]
    }
  | { success: false; error: string }
> {
  try {
    const { clientId, companyId } = await requirePortalClient()
    const admin = createSupabaseAdmin()

    let photosQuery = admin
      .from('job_photos')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (options?.scheduleId) {
      photosQuery = photosQuery.eq('schedule_id', options.scheduleId)
    }

    const [photosResult, jobsResult, companyResult] = await Promise.all([
      photosQuery,
      admin
        .from('schedules')
        .select('id, title, start_time, status')
        .eq('client_id', clientId)
        .order('start_time', { ascending: false }),
      admin
        .from('companies')
        .select('job_photo_categories')
        .eq('id', companyId)
        .single(),
    ])

    if (photosResult.error) {
      if (photosResult.error.code === '42P01') {
        return {
          success: true,
          photos: [],
          jobs: jobsResult.data || [],
          categories: normalizeJobPhotoCategories(null),
        }
      }
      throw photosResult.error
    }
    if (jobsResult.error) throw jobsResult.error

    const photos = await attachPortalPhotoUrls(admin, photosResult.data || [])

    return {
      success: true,
      photos,
      jobs: jobsResult.data || [],
      categories: normalizeJobPhotoCategories(companyResult.data?.job_photo_categories),
    }
  } catch (error: any) {
    console.error('getPortalPhotosPageDataAction error:', error)
    return { success: false, error: error.message || 'Failed to load photos' }
  }
}