'use server'

import { revalidatePath } from 'next/cache'
import { getSessionProfile, createSupabaseAdmin } from '@/lib/portal-auth'
import { calcBillingSummary, formatCurrency } from '@/lib/billing'
import { syncEstimateDocument } from '@/lib/estimates-server'
import { validateMessageBody, type MessagingMessage } from '@/lib/messaging'
import type { UploadedDocument } from '@/lib/uploaded-documents'
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
  const session = await getSessionProfile()
  if (!session || session.profile.role !== 'client' || !session.profile.client_id) {
    throw new Error('Unauthorized')
  }

  const admin = createSupabaseAdmin()
  const { data: client } = await admin
    .from('clients')
    .select('id, portal_enabled, company_id')
    .eq('id', session.profile.client_id)
    .single()

  if (!client?.portal_enabled) throw new Error('Portal access disabled')

  return { profile: session.profile, clientId: session.profile.client_id, companyId: client.company_id }
}

export async function getPortalHomeData() {
  const { clientId } = await requirePortalClient()
  const admin = createSupabaseAdmin()
  const now = new Date().toISOString()

  const { data: schedules } = await admin
    .from('schedules')
    .select('id')
    .eq('client_id', clientId)
    .gte('start_time', now)
    .neq('status', 'archived')
    .neq('status', 'cancelled')

  const scheduleIds = (schedules || []).map((s) => s.id)
  let balanceDue = 0

  if (scheduleIds.length > 0) {
    const { data: lineItems } = await admin
      .from('billing_line_items')
      .select('amount, schedule_id')
      .in('schedule_id', scheduleIds)

    const { data: payments } = await admin
      .from('billing_payments')
      .select('amount, schedule_id')
      .in('schedule_id', scheduleIds)

    for (const sid of scheduleIds) {
      const lines = (lineItems || []).filter((l) => l.schedule_id === sid)
      const pays = (payments || []).filter((p) => p.schedule_id === sid)
      balanceDue += calcBillingSummary(lines, pays).balanceDue
    }
  }

  const { count: pendingEstimatesCount } = await admin
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'sent')

  const { data: nextJob } = await admin
    .from('schedules')
    .select('id, title, start_time')
    .eq('client_id', clientId)
    .gte('start_time', now)
    .neq('status', 'archived')
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  return {
    upcomingJobCount: schedules?.length ?? 0,
    balanceDue,
    balanceDueFormatted: formatCurrency(balanceDue),
    pendingEstimatesCount: pendingEstimatesCount ?? 0,
    nextJob: nextJob ?? null,
  }
}

export async function getPortalJobsAction() {
  const { clientId } = await requirePortalClient()
  const admin = createSupabaseAdmin()

  const { data: schedules, error } = await admin
    .from('schedules')
    .select('id, title, start_time, end_time, status, price')
    .eq('client_id', clientId)
    .order('start_time', { ascending: true })

  if (error) throw error

  const jobs = schedules || []
  const scheduleIds = jobs.map((j) => j.id)

  let lineItems: { schedule_id: string; amount: number }[] = []
  let payments: { schedule_id: string; amount: number }[] = []

  if (scheduleIds.length > 0) {
    const { data: lines } = await admin
      .from('billing_line_items')
      .select('schedule_id, amount')
      .in('schedule_id', scheduleIds)

    const { data: pays } = await admin
      .from('billing_payments')
      .select('schedule_id, amount')
      .in('schedule_id', scheduleIds)

    lineItems = lines || []
    payments = pays || []
  }

  const jobsWithBilling = jobs.map((job) => {
    const lines = lineItems.filter((l) => l.schedule_id === job.id)
    const pays = payments.filter((p) => p.schedule_id === job.id)
    const summary = calcBillingSummary(lines, pays)

    return {
      ...job,
      balanceDue: summary.balanceDue,
      balanceDueFormatted: formatCurrency(summary.balanceDue),
      canPay: summary.balanceDue > 0 && lines.length > 0,
      isPaid: lines.length > 0 && summary.balanceDue <= 0,
    }
  })

  return { jobs: jobsWithBilling }
}

export async function getPortalJobBillingAction(scheduleId: string) {
  const { clientId } = await requirePortalClient()
  const admin = createSupabaseAdmin()

  const { data: schedule } = await admin
    .from('schedules')
    .select('id, title, start_time, status, price, client_id')
    .eq('id', scheduleId)
    .eq('client_id', clientId)
    .single()

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

  return {
    success: true as const,
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
    clientId,
  }
}

export async function respondToEstimateAction(
  estimateId: string,
  response: 'accepted' | 'declined'
) {
  const { clientId } = await requirePortalClient()
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

    const { clientId, companyId, profile } = await requirePortalClient()
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

export async function getPortalUploadedDocumentsAction(): Promise<
  { success: true; documents: UploadedDocument[] } | { success: false; error: string }
> {
  try {
    const { clientId } = await requirePortalClient()
    const admin = createSupabaseAdmin()

    const { data: documents, error } = await admin
      .from('client_documents')
      .select('*')
      .eq('client_id', clientId)
      .eq('source', 'upload')
      .is('schedule_id', null)
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42703') {
        return { success: true, documents: [] }
      }
      throw error
    }

    return { success: true, documents: (documents || []) as UploadedDocument[] }
  } catch (error: any) {
    console.error('getPortalUploadedDocumentsAction error:', error)
    return { success: false, error: error.message || 'Failed to load documents' }
  }
}