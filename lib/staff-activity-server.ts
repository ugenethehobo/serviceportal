import type { SupabaseClient } from '@supabase/supabase-js'
import { buildClientActivityForStaff, buildCompanyActivity } from '@/lib/staff-activity'
import type { ActivityFeedItem } from '@/lib/activity-feed'
import type { PortalJob } from '@/lib/portal-jobs'
import { calcBillingSummary, formatCurrency } from '@/lib/billing'
import { isJobBillableForClient } from '@/lib/portal-jobs'
import { getDisplayAddressFromClient } from '@/lib/address'

const COMPANY_ACTIVITY_LOOKBACK_DAYS = 60

function activityLookbackIso(now = new Date()) {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - COMPANY_ACTIVITY_LOOKBACK_DAYS)
  return cutoff.toISOString()
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
  lineItems: { schedule_id: string; amount: number; created_at?: string }[],
  payments: { schedule_id: string; amount: number }[],
  serviceAddress: string,
  now = new Date()
): PortalJob {
  const lines = lineItems.filter((line) => line.schedule_id === schedule.id)
  const pays = payments.filter((payment) => payment.schedule_id === schedule.id)
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
  const displayBalance = billable ? summary.balanceDue : 0

  return {
    ...scheduleShape,
    balanceDue: displayBalance,
    balanceDueFormatted: formatCurrency(displayBalance),
    canPay: billable && summary.balanceDue > 0 && lines.length > 0,
    isPaid: lines.length > 0 && summary.balanceDue <= 0,
    totalCharged: summary.totalCharged,
    totalPaid: summary.totalPaid,
    isBillable: billable,
  }
}

export async function fetchCompanyActivity(
  admin: SupabaseClient,
  companyId: string,
  now = new Date()
): Promise<ActivityFeedItem[]> {
  const lookbackIso = activityLookbackIso(now)

  const [
    { data: payments },
    { data: contracts },
    { data: estimates },
    { data: leads },
    { data: messages },
  ] = await Promise.all([
    admin
      .from('billing_payments')
      .select(
        'id, client_id, schedule_id, amount, source, created_at, client:clients!client_id (id, name)'
      )
      .eq('company_id', companyId)
      .gte('created_at', lookbackIso)
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('contracts')
      .select(
        'id, client_id, schedule_id, title, status, sent_at, updated_at, client_signed_at, client:clients!client_id (id, name)'
      )
      .eq('company_id', companyId)
      .in('status', ['ready_for_signing', 'signed'])
      .order('updated_at', { ascending: false })
      .limit(40),
    admin
      .from('estimates')
      .select(
        'id, client_id, title, total, status, updated_at, client:clients!client_id (id, name)'
      )
      .eq('company_id', companyId)
      .in('status', ['sent', 'accepted', 'declined'])
      .gte('updated_at', lookbackIso)
      .order('updated_at', { ascending: false })
      .limit(40),
    admin
      .from('leads')
      .select('id, name, follow_up_at, status')
      .eq('company_id', companyId)
      .not('follow_up_at', 'is', null)
      .not('status', 'in', '("archived","won","lost")')
      .order('follow_up_at', { ascending: true })
      .limit(30),
    admin
      .from('messages')
      .select(
        `
        id,
        body,
        created_at,
        thread:message_threads!thread_id (
          client_id,
          client:clients!client_id (id, name)
        )
      `
      )
      .eq('company_id', companyId)
      .eq('sender_role', 'client')
      .gte('created_at', lookbackIso)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  return buildCompanyActivity({
    payments: payments || [],
    contracts: contracts || [],
    estimates: estimates || [],
    leads: leads || [],
    messages: messages || [],
    now,
  })
}

export async function fetchClientActivityForStaff(
  admin: SupabaseClient,
  companyId: string,
  clientId: string,
  now = new Date()
): Promise<ActivityFeedItem[]> {
  const [
    { data: client },
    { data: schedules },
    { data: estimates },
    { data: allLineItems },
    { data: recentPayments },
    { data: scheduleRows },
    { data: contracts },
  ] = await Promise.all([
    admin
      .from('clients')
      .select(
        'address, address_street, address_unit, address_city, address_state, address_zip'
      )
      .eq('id', clientId)
      .eq('company_id', companyId)
      .single(),
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
        crew:crews!crew_id (id, name)
      `
      )
      .eq('client_id', clientId)
      .order('start_time', { ascending: true }),
    admin
      .from('estimates')
      .select('id, client_id, title, total, status, updated_at')
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

  if (!client) return []

  const serviceAddress = getDisplayAddressFromClient(client) || ''
  const scheduleList = schedules || []
  const scheduleIds = scheduleList.map((schedule) => schedule.id)

  let lineAmounts: { schedule_id: string; amount: number }[] = []
  let paymentAmounts: { schedule_id: string; amount: number }[] = []

  if (scheduleIds.length > 0) {
    const [{ data: lines }, { data: pays }] = await Promise.all([
      admin.from('billing_line_items').select('schedule_id, amount').in('schedule_id', scheduleIds),
      admin.from('billing_payments').select('schedule_id, amount').in('schedule_id', scheduleIds),
    ])
    lineAmounts = lines || []
    paymentAmounts = pays || []
  }

  const jobs = scheduleList.map((schedule) =>
    mapScheduleToPortalJob(schedule, lineAmounts, paymentAmounts, serviceAddress, now)
  )

  const schedulesById = new Map((scheduleRows || []).map((row) => [row.id, row]))

  const timezoneRow = await admin
    .from('companies')
    .select('timezone')
    .eq('id', companyId)
    .single()

  const timezone = timezoneRow.data?.timezone || 'America/Chicago'

  return buildClientActivityForStaff({
    timezone,
    clientId,
    estimates: (estimates || []).map((estimate) => ({
      id: estimate.id,
      title: estimate.title,
      total: estimate.total,
      status: estimate.status,
      updated_at: estimate.updated_at,
    })),
    contracts: contracts || [],
    jobs,
    payments: recentPayments || [],
    lineItems: allLineItems || [],
    schedulesById,
    staffEstimates: estimates || [],
    now,
  })
}