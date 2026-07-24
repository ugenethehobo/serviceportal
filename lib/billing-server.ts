import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { calcBillingSummary, calcLineAmount } from '@/lib/billing'
import {
  assertStripeAmountFitsLedger,
  computePaymentAmountAfterRefund,
  LEDGER_OVERPAYMENT_OPS_ACTION,
} from '@/lib/billing-stripe'
import { syncJobInvoiceDocument } from '@/lib/invoices-server'
import {
  computeCanPay,
  computeImplicitFullBalancePayable,
  computePlanPayable,
  type BillingInstallment,
  type CollectiblePolicy,
  type PaymentForAllocation,
  roundMoney,
} from '@/lib/payment-plans'
import { isJobBillableForClient } from '@/lib/portal-jobs'

type SupabaseAdmin = SupabaseClient

export type JobBillingTotals = {
  scheduleId: string
  clientId: string
  companyId: string | undefined
  jobTitle: string
  lineItemCount: number
  /** Visit-start / status gate */
  billable: boolean
  summary: {
    totalCharged: number
    totalPaid: number
    /** ALWAYS ledger: totalCharged - totalPaid. Never zeroed for !billable. */
    balanceDue: number
  }
  amountDueNow: number
  maxPayableNow: number
  hasCollectibleNow: boolean
  canPay: boolean
  allowPayAhead: boolean
  scheduleStatus: string
  startTime: string
}

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

  const { materializePaymentPlanForSchedule } = await import('@/lib/payment-plans-server')
  await materializePaymentPlanForSchedule(supabaseAdmin, {
    scheduleId,
    clientId,
    companyId,
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
    const { materializePaymentPlanForSchedule } = await import('@/lib/payment-plans-server')
    await materializePaymentPlanForSchedule(supabaseAdmin, {
      scheduleId: targetScheduleId,
      clientId,
      companyId,
    })
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

function parseCollectiblePolicy(raw: unknown): CollectiblePolicy {
  if (!raw || typeof raw !== 'object') {
    return { when: 'on_or_after_visit_start' }
  }
  const when = (raw as { when?: string }).when
  if (when === 'anytime') return { when: 'anytime' }
  if (when === 'on_or_after_job_complete') return { when: 'on_or_after_job_complete' }
  if (when === 'relative_days') {
    const days = Number((raw as { daysBeforeStart?: number }).daysBeforeStart) || 0
    return { when: 'relative_days', daysBeforeStart: days }
  }
  return { when: 'on_or_after_visit_start' }
}

/**
 * Optional plan layer (PR1 tables). If missing/unavailable, null → implicit full_balance.
 */
async function loadOptionalPlanPayable(
  supabaseAdmin: SupabaseAdmin,
  scheduleId: string,
  schedule: { status: string; start_time: string },
  summary: { totalCharged: number; totalPaid: number; balanceDue: number }
): Promise<{
  amountDueNow: number
  maxPayableNow: number
  hasCollectibleNow: boolean
  allowPayAhead: boolean
} | null> {
  const { data: plan, error: planError } = await supabaseAdmin
    .from('job_payment_plans')
    .select('id, allow_pay_ahead')
    .eq('schedule_id', scheduleId)
    .maybeSingle()

  if (planError) {
    // 42P01 undefined_table — migration not applied yet
    if (planError.code === '42P01' || planError.message?.includes('does not exist')) {
      return null
    }
    console.error('loadOptionalPlanPayable plan error:', planError)
    return null
  }
  if (!plan) return null

  const { data: installmentRows, error: instError } = await supabaseAdmin
    .from('billing_installments')
    .select(
      'id, schedule_id, job_payment_plan_id, client_id, company_id, sequence, key, label, amount_due, due_date, collectible_policy, status, created_at, updated_at'
    )
    .eq('schedule_id', scheduleId)

  if (instError || !installmentRows?.length) return null

  const { data: paymentRows } = await supabaseAdmin
    .from('billing_payments')
    .select('id, amount, payment_date, created_at, installment_id')
    .eq('schedule_id', scheduleId)

  const installments: BillingInstallment[] = installmentRows.map((row) => ({
    id: row.id,
    schedule_id: row.schedule_id,
    job_payment_plan_id: row.job_payment_plan_id,
    client_id: row.client_id,
    company_id: row.company_id,
    sequence: row.sequence,
    key: row.key,
    label: row.label,
    amount_due: Number(row.amount_due),
    due_date: row.due_date,
    collectible_policy: parseCollectiblePolicy(row.collectible_policy),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))

  const payments: PaymentForAllocation[] = (paymentRows || []).map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    payment_date: p.payment_date,
    created_at: p.created_at,
    installment_id: p.installment_id,
  }))

  const allowPayAhead = plan.allow_pay_ahead !== false
  const payable = computePlanPayable({
    installments,
    payments,
    totalCharged: summary.totalCharged,
    totalPaid: summary.totalPaid,
    allowPayAhead,
    schedule: { status: schedule.status, startTime: schedule.start_time },
  })

  return {
    amountDueNow: payable.amountDueNow,
    maxPayableNow: payable.maxPayableNow,
    hasCollectibleNow: payable.hasCollectibleNow,
    allowPayAhead,
  }
}

export async function fetchJobBillingTotals(
  scheduleId: string,
  clientId: string
): Promise<JobBillingTotals | null> {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: schedule, error: scheduleError } = await supabaseAdmin
    .from('schedules')
    .select(
      `
      id,
      client_id,
      title,
      status,
      start_time,
      client:clients!client_id (company_id)
    `
    )
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
    {
      status: (schedule as any).status,
      startTime: (schedule as any).start_time,
    },
    new Date()
  )
  const lineItemCount = lineItems?.length ?? 0

  // Ledger balance is NEVER zeroed for collectibility (K10)
  const summary = {
    totalCharged: rawSummary.totalCharged,
    totalPaid: rawSummary.totalPaid,
    balanceDue: rawSummary.balanceDue,
  }

  const planPayable = await loadOptionalPlanPayable(
    supabaseAdmin,
    scheduleId,
    {
      status: (schedule as any).status,
      start_time: (schedule as any).start_time,
    },
    summary
  )

  let amountDueNow: number
  let maxPayableNow: number
  let hasCollectibleNow: boolean
  let allowPayAhead: boolean

  if (planPayable) {
    amountDueNow = planPayable.amountDueNow
    maxPayableNow = planPayable.maxPayableNow
    hasCollectibleNow = planPayable.hasCollectibleNow
    allowPayAhead = planPayable.allowPayAhead
  } else {
    const imp = computeImplicitFullBalancePayable({
      totalCharged: summary.totalCharged,
      totalPaid: summary.totalPaid,
      billable,
    })
    amountDueNow = imp.amountDueNow
    maxPayableNow = imp.maxPayableNow
    hasCollectibleNow = imp.hasCollectibleNow
    allowPayAhead = true
  }

  const canPay = computeCanPay({
    balanceDue: summary.balanceDue,
    lineItemCount,
    billable,
    plan: planPayable
      ? {
          allowPayAhead,
          amountDueNow,
          hasCollectibleNow,
        }
      : null,
  })

  return {
    scheduleId,
    clientId,
    companyId: client?.company_id,
    jobTitle: (schedule as any).title,
    summary,
    lineItemCount,
    billable,
    amountDueNow,
    maxPayableNow,
    hasCollectibleNow,
    canPay,
    allowPayAhead,
    scheduleStatus: (schedule as any).status,
    startTime: (schedule as any).start_time,
  }
}

export type RecordStripePaymentResult =
  | { success: true; duplicate: boolean }
  | {
      success: false
      code: 'LEDGER_OVERPAYMENT'
      amount: number
      balanceDue: number
      paymentIntentId: string
      scheduleId: string
    }

export async function recordStripePayment(data: {
  scheduleId: string
  clientId: string
  companyId: string
  amount: number
  paymentIntentId: string
  installmentId?: string | null
}): Promise<RecordStripePaymentResult> {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: existing } = await supabaseAdmin
    .from('billing_payments')
    .select('id')
    .eq('stripe_payment_intent_id', data.paymentIntentId)
    .maybeSingle()

  if (existing) return { success: true, duplicate: true }

  // Succeed-time live ledger recheck (never trust create-time balance alone)
  const { data: lineItems } = await supabaseAdmin
    .from('billing_line_items')
    .select('amount')
    .eq('schedule_id', data.scheduleId)

  const { data: payments } = await supabaseAdmin
    .from('billing_payments')
    .select('amount')
    .eq('schedule_id', data.scheduleId)

  const live = calcBillingSummary(lineItems || [], payments || [])
  const amount = roundMoney(data.amount)
  const gate = assertStripeAmountFitsLedger(amount, live.balanceDue)

  if (!gate.ok) {
    console.error('[LEDGER_OVERPAYMENT] Stripe payment refused at succeed-time', {
      code: 'LEDGER_OVERPAYMENT',
      scheduleId: data.scheduleId,
      clientId: data.clientId,
      companyId: data.companyId,
      paymentIntentId: data.paymentIntentId,
      amount: gate.amount,
      balanceDue: gate.balanceDue,
      action: LEDGER_OVERPAYMENT_OPS_ACTION,
      opsHint:
        'Payment succeeded on Stripe but was not recorded on the job ledger. Refund the PaymentIntent in Stripe Dashboard (or issue a credit) so the client is not charged for unrecorded money.',
    })
    return {
      success: false,
      code: 'LEDGER_OVERPAYMENT',
      amount: gate.amount,
      balanceDue: gate.balanceDue,
      paymentIntentId: data.paymentIntentId,
      scheduleId: data.scheduleId,
    }
  }

  const insertRow: Record<string, unknown> = {
    schedule_id: data.scheduleId,
    client_id: data.clientId,
    company_id: data.companyId,
    amount,
    payment_date: new Date().toISOString().slice(0, 10),
    method: 'card',
    notes: 'Client portal payment',
    source: 'stripe',
    stripe_payment_intent_id: data.paymentIntentId,
  }

  if (data.installmentId) {
    insertRow.installment_id = data.installmentId
  }

  const { error } = await supabaseAdmin.from('billing_payments').insert(insertRow)

  if (error) {
    // Race: unique on stripe_payment_intent_id
    if (error.code === '23505') {
      return { success: true, duplicate: true }
    }
    // installment_id column may not exist yet
    if (data.installmentId && (error.message?.includes('installment_id') || error.code === '42703')) {
      delete insertRow.installment_id
      const retry = await supabaseAdmin.from('billing_payments').insert(insertRow)
      if (retry.error) throw retry.error
    } else {
      throw error
    }
  }

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
      amount,
      scheduleId: data.scheduleId,
      clientId: data.clientId,
      paymentMethod: 'card',
    })
  })

  try {
    const { refreshInstallmentStatuses } = await import('@/lib/payment-plans-server')
    await refreshInstallmentStatuses(supabaseAdmin, data.scheduleId)
  } catch (error) {
    console.error('refreshInstallmentStatuses after stripe payment error:', error)
  }

  try {
    await syncJobInvoiceDocument(data.scheduleId)
  } catch (error) {
    console.error('syncJobInvoiceDocument after stripe payment error:', error)
  }

  return { success: true, duplicate: false }
}

/**
 * Apply Stripe refund using charge totals (cumulative-safe).
 * Prefer chargeAmount + amountRefundedCumulative over delta-from-current-row.
 */
export async function handleStripeRefund(
  paymentIntentId: string,
  amountRefundedCumulative: number,
  chargeAmount?: number
) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: payment, error } = await supabaseAdmin
    .from('billing_payments')
    .select('id, amount, schedule_id, client_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()

  if (error || !payment) return { handled: false }

  // Prefer Stripe charge totals when provided (fixes successive partial refunds).
  // Fallback: treat second arg as cumulative against current amount + already-reduced state
  // by using max(payment.amount, chargeAmount) as charge base when chargeAmount omitted.
  const chargeBase =
    chargeAmount != null && chargeAmount > 0
      ? chargeAmount
      : // Legacy callers: amountRefundedCumulative was misused as delta.
        // Infer original ≈ current + refunded if refunded looks like a delta small enough.
        roundMoney(Number(payment.amount) + amountRefundedCumulative)

  const { remaining, fullyRefunded } = computePaymentAmountAfterRefund(
    chargeBase,
    amountRefundedCumulative
  )

  if (fullyRefunded) {
    await supabaseAdmin.from('billing_payments').delete().eq('id', payment.id)
  } else {
    await supabaseAdmin
      .from('billing_payments')
      .update({
        amount: remaining,
        notes: 'Partial Stripe refund applied',
      })
      .eq('id', payment.id)
  }

  revalidatePath(`/dashboard/clients/${payment.client_id}`)
  revalidatePath(`/dashboard/clients/${payment.client_id}/jobs/${payment.schedule_id}`)
  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/reports')

  try {
    const { refreshInstallmentStatuses } = await import('@/lib/payment-plans-server')
    await refreshInstallmentStatuses(supabaseAdmin, payment.schedule_id)
  } catch (error) {
    console.error('refreshInstallmentStatuses after stripe refund error:', error)
  }

  try {
    await syncJobInvoiceDocument(payment.schedule_id)
  } catch (error) {
    console.error('syncJobInvoiceDocument after stripe refund error:', error)
  }

  return { handled: true, remaining, fullyRefunded }
}
