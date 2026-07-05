import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { calcBillingSummary, calcLineAmount } from '@/lib/billing'
import { syncJobInvoiceDocument } from '@/lib/invoices-server'
import { isJobBillableForClient } from '@/lib/portal-jobs'

type SupabaseAdmin = SupabaseClient

export async function seedBillingFromJobPrice(
  supabaseAdmin: SupabaseAdmin,
  scheduleId: string,
  clientId: string,
  companyId: string,
  title: string,
  price: number
) {
  if (price <= 0) return

  const { data: existing } = await supabaseAdmin
    .from('billing_line_items')
    .select('id')
    .eq('schedule_id', scheduleId)
    .limit(1)

  if (existing && existing.length > 0) return

  const amount = calcLineAmount(1, price)
  await supabaseAdmin.from('billing_line_items').insert({
    schedule_id: scheduleId,
    client_id: clientId,
    company_id: companyId,
    description: title,
    quantity: 1,
    unit_price: price,
    amount,
  })
}

/** Copy line items from a source job to a new recurring instance (editable after creation). */
export async function duplicateBillingToSchedule(
  supabaseAdmin: SupabaseAdmin,
  sourceScheduleId: string,
  targetScheduleId: string,
  clientId: string,
  companyId: string,
  fallback: { title: string; price: number }
) {
  const { data: items } = await supabaseAdmin
    .from('billing_line_items')
    .select('description, quantity, unit_price, amount')
    .eq('schedule_id', sourceScheduleId)

  if (items && items.length > 0) {
    await supabaseAdmin.from('billing_line_items').insert(
      items.map((item) => ({
        schedule_id: targetScheduleId,
        client_id: clientId,
        company_id: companyId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      }))
    )
    return
  }

  await seedBillingFromJobPrice(
    supabaseAdmin,
    targetScheduleId,
    clientId,
    companyId,
    fallback.title,
    fallback.price
  )
}

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}

export async function fetchJobBillingTotals(scheduleId: string, clientId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: schedule, error: scheduleError } = await supabaseAdmin
    .from('schedules')
    .select(`
      id,
      client_id,
      title,
      status,
      start_time,
      client:clients!client_id (company_id)
    `)
    .eq('id', scheduleId)
    .eq('client_id', clientId)
    .single()

  if (scheduleError || !schedule) return null

  const client = Array.isArray((schedule as any).client)
    ? (schedule as any).client[0]
    : (schedule as any).client

  const { data: lineItems } = await supabaseAdmin
    .from('billing_line_items')
    .select('amount')
    .eq('schedule_id', scheduleId)

  const { data: payments } = await supabaseAdmin
    .from('billing_payments')
    .select('amount')
    .eq('schedule_id', scheduleId)

  const rawSummary = calcBillingSummary(lineItems || [], payments || [])
  const billable = isJobBillableForClient(
    { status: (schedule as any).status, startTime: (schedule as any).start_time },
    new Date()
  )
  const summary = {
    ...rawSummary,
    balanceDue: billable ? rawSummary.balanceDue : 0,
  }

  return {
    scheduleId,
    clientId,
    companyId: client?.company_id,
    jobTitle: (schedule as any).title,
    summary,
    lineItemCount: lineItems?.length ?? 0,
    billable,
  }
}

export async function recordStripePayment(data: {
  scheduleId: string
  clientId: string
  companyId: string
  amount: number
  paymentIntentId: string
}) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: existing } = await supabaseAdmin
    .from('billing_payments')
    .select('id')
    .eq('stripe_payment_intent_id', data.paymentIntentId)
    .maybeSingle()

  if (existing) return { success: true, duplicate: true }

  const { error } = await supabaseAdmin.from('billing_payments').insert({
    schedule_id: data.scheduleId,
    client_id: data.clientId,
    company_id: data.companyId,
    amount: data.amount,
    payment_date: new Date().toISOString().slice(0, 10),
    method: 'card',
    notes: 'Client portal payment',
    source: 'stripe',
    stripe_payment_intent_id: data.paymentIntentId,
  })

  if (error) throw error

  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/reports')
  revalidatePath(`/dashboard/clients/${data.clientId}`)
  revalidatePath(`/dashboard/clients/${data.clientId}/jobs/${data.scheduleId}`)

  const { data: schedule } = await supabaseAdmin
    .from('schedules')
    .select('title, client:clients!client_id (name, email)')
    .eq('id', data.scheduleId)
    .single()

  const client = Array.isArray((schedule as any)?.client)
    ? (schedule as any).client[0]
    : (schedule as any)?.client

  const { notifyPaymentReceived, queueNotification } = await import(
    '@/lib/notifications-server'
  )

  void queueNotification(supabaseAdmin, async (admin) => {
    const { data: company } = await admin
      .from('companies')
      .select('name')
      .eq('id', data.companyId)
      .single()

    await notifyPaymentReceived(admin, {
      companyId: data.companyId,
      companyName: company?.name,
      clientEmail: client?.email,
      clientName: client?.name,
      jobTitle: (schedule as any)?.title || 'Job',
      amount: data.amount,
      scheduleId: data.scheduleId,
      clientId: data.clientId,
      paymentMethod: 'card',
    })
  })

  try {
    await syncJobInvoiceDocument(data.scheduleId)
  } catch (error) {
    console.error('syncJobInvoiceDocument after stripe payment error:', error)
  }

  return { success: true, duplicate: false }
}

export async function handleStripeRefund(paymentIntentId: string, refundedAmount: number) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: payment, error } = await supabaseAdmin
    .from('billing_payments')
    .select('id, amount, schedule_id, client_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()

  if (error || !payment) return { handled: false }

  const currentAmount = Number(payment.amount)
  const refundTotal = Math.round(refundedAmount * 100) / 100

  if (refundTotal >= currentAmount - 0.009) {
    await supabaseAdmin.from('billing_payments').delete().eq('id', payment.id)
  } else {
    const nextAmount = Math.round((currentAmount - refundTotal) * 100) / 100
    await supabaseAdmin
      .from('billing_payments')
      .update({
        amount: nextAmount,
        notes: 'Partial Stripe refund applied',
      })
      .eq('id', payment.id)
  }

  revalidatePath(`/dashboard/clients/${payment.client_id}`)
  revalidatePath(`/dashboard/clients/${payment.client_id}/jobs/${payment.schedule_id}`)
  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/reports')

  try {
    await syncJobInvoiceDocument(payment.schedule_id)
  } catch (error) {
    console.error('syncJobInvoiceDocument after stripe refund error:', error)
  }

  return { handled: true }
}