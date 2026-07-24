/**
 * Server-side payment plan materialization, rebalance, and status refresh.
 * Pure domain logic lives in lib/payment-plans.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { calcBillingSummary } from '@/lib/billing'
import {
  allocatePaymentsToInstallments,
  buildPlanProgressSummary,
  classifyAllFutureInstance,
  emptyAllFutureCounts,
  expandTemplate,
  normalizeTemplate,
  parseCompanyJobPaymentSettings,
  rematerializeInstallments,
  rebalanceInstallments,
  resolveEffectiveTemplate,
  sharesFromExpanded,
  tallyAllFutureDecision,
  validatePaymentAmount,
  type AllFutureCounts,
  type BillingInstallment,
  type CollectiblePolicy,
  type InstallmentStatus,
  type JobPaymentPlanTemplate,
  type JobPaymentPlanType,
  type PaymentForAllocation,
  type PlanProgressSummary,
  roundMoney,
  MONEY_EPS,
} from '@/lib/payment-plans'
import { randomUUID } from 'crypto'

type SupabaseAdmin = SupabaseClient

export type PlanSource =
  | 'company_default'
  | 'series_default'
  | 'job_override'
  | 'legacy_none'

export type MaterializeResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  planId?: string
  needsAttention?: boolean
  needsAttentionReason?: string | null
  allocatedExistingPayments?: boolean
  error?: string
}

/** K20: kill switch skips materialize/rebalance (partial Stripe still works). */
export function isJobPaymentPlansEnabled(): boolean {
  return process.env.ENABLE_JOB_PAYMENT_PLANS !== 'false'
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

function mapInstallmentRow(row: Record<string, unknown>): BillingInstallment {
  return {
    id: row.id as string,
    schedule_id: row.schedule_id as string,
    job_payment_plan_id: row.job_payment_plan_id as string,
    client_id: row.client_id as string,
    company_id: row.company_id as string,
    sequence: Number(row.sequence),
    key: row.key as string,
    label: row.label as string,
    amount_due: Number(row.amount_due),
    due_date: (row.due_date as string | null) ?? null,
    collectible_policy: parseCollectiblePolicy(row.collectible_policy),
    status: row.status as InstallmentStatus,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === '42703' ||
    Boolean(error.message?.includes('does not exist'))
  )
}

export async function loadScheduleBillingLedger(
  supabaseAdmin: SupabaseAdmin,
  scheduleId: string
): Promise<{
  totalCharged: number
  totalPaid: number
  balanceDue: number
  payments: PaymentForAllocation[]
  lineItemCount: number
}> {
  const [{ data: lines }, { data: pays }] = await Promise.all([
    supabaseAdmin.from('billing_line_items').select('amount').eq('schedule_id', scheduleId),
    supabaseAdmin
      .from('billing_payments')
      .select('id, amount, payment_date, created_at, installment_id')
      .eq('schedule_id', scheduleId),
  ])

  const summary = calcBillingSummary(lines || [], pays || [])
  const payments: PaymentForAllocation[] = (pays || []).map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    payment_date: p.payment_date,
    created_at: p.created_at,
    installment_id: (p as { installment_id?: string | null }).installment_id ?? null,
  }))

  return {
    totalCharged: summary.totalCharged,
    totalPaid: summary.totalPaid,
    balanceDue: summary.balanceDue,
    payments,
    lineItemCount: lines?.length ?? 0,
  }
}

async function loadInstallments(
  supabaseAdmin: SupabaseAdmin,
  scheduleId: string
): Promise<BillingInstallment[] | null> {
  const { data, error } = await supabaseAdmin
    .from('billing_installments')
    .select(
      'id, schedule_id, job_payment_plan_id, client_id, company_id, sequence, key, label, amount_due, due_date, collectible_policy, status, created_at, updated_at'
    )
    .eq('schedule_id', scheduleId)

  if (error) {
    if (isMissingTableError(error)) return null
    console.error('loadInstallments error:', error)
    return null
  }
  return (data || []).map((row) => mapInstallmentRow(row as Record<string, unknown>))
}

async function loadPlanRow(
  supabaseAdmin: SupabaseAdmin,
  scheduleId: string
): Promise<{
  id: string
  plan_type: JobPaymentPlanType
  template: unknown
  source: PlanSource
  allow_pay_ahead: boolean
  lock_portal_to_due_now: boolean
  needs_attention: boolean
  needs_attention_reason: string | null
} | null> {
  const { data, error } = await supabaseAdmin
    .from('job_payment_plans')
    .select(
      'id, plan_type, template, source, allow_pay_ahead, lock_portal_to_due_now, needs_attention, needs_attention_reason'
    )
    .eq('schedule_id', scheduleId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) return null
    console.error('loadPlanRow error:', error)
    return null
  }
  return data as any
}

export async function resolveTemplateForSchedule(
  supabaseAdmin: SupabaseAdmin,
  scheduleId: string,
  companyId: string
): Promise<{ template: JobPaymentPlanTemplate; source: PlanSource }> {
  const { data: schedule } = await supabaseAdmin
    .from('schedules')
    .select('recurring_rule_id')
    .eq('id', scheduleId)
    .single()

  let seriesTemplate: unknown = null
  if (schedule?.recurring_rule_id) {
    const { data: rule } = await supabaseAdmin
      .from('recurring_rules')
      .select('payment_plan_template')
      .eq('id', schedule.recurring_rule_id)
      .maybeSingle()
    if (rule?.payment_plan_template != null) {
      seriesTemplate = rule.payment_plan_template
    }
  }

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('job_payment_settings')
    .eq('id', companyId)
    .maybeSingle()

  const companySettings = company?.job_payment_settings
  const template = resolveEffectiveTemplate({
    companySettings,
    seriesTemplate,
  })

  const source: PlanSource =
    seriesTemplate != null ? 'series_default' : 'company_default'

  return { template, source }
}

async function persistInstallments(
  supabaseAdmin: SupabaseAdmin,
  installments: BillingInstallment[],
  deletedIds: string[]
): Promise<void> {
  if (deletedIds.length > 0) {
    await supabaseAdmin.from('billing_installments').delete().in('id', deletedIds)
  }

  for (const inst of installments) {
    const row = {
      id: inst.id,
      schedule_id: inst.schedule_id,
      job_payment_plan_id: inst.job_payment_plan_id,
      client_id: inst.client_id,
      company_id: inst.company_id,
      sequence: inst.sequence,
      key: inst.key,
      label: inst.label,
      amount_due: inst.amount_due,
      due_date: inst.due_date,
      collectible_policy: inst.collectible_policy,
      status: inst.status,
      created_at: inst.created_at,
      updated_at: inst.updated_at,
    }
    const { error } = await supabaseAdmin.from('billing_installments').upsert(row, {
      onConflict: 'id',
    })
    if (error) throw error
  }
}

/**
 * Materialize (or re-materialize) plan rows for a schedule from resolved template.
 * full_balance with no existing paid installments → no rows (null ≡ legacy).
 */
export async function materializePaymentPlanForSchedule(
  supabaseAdmin: SupabaseAdmin,
  input: {
    scheduleId: string
    clientId: string
    companyId: string
    /** Force materialize even for full_balance (staff attach). */
    force?: boolean
    templateOverride?: JobPaymentPlanTemplate | null
    sourceOverride?: PlanSource
  }
): Promise<MaterializeResult> {
  if (!isJobPaymentPlansEnabled()) {
    return { ok: true, skipped: true, reason: 'feature_disabled' }
  }

  try {
    const { data: schedule, error: scheduleError } = await supabaseAdmin
      .from('schedules')
      .select('id, status, start_time')
      .eq('id', input.scheduleId)
      .single()

    if (scheduleError || !schedule) {
      return { ok: false, error: 'Schedule not found' }
    }

    const resolved = input.templateOverride
      ? {
          template: normalizeTemplate(input.templateOverride),
          source: input.sourceOverride || ('job_override' as PlanSource),
        }
      : await resolveTemplateForSchedule(
          supabaseAdmin,
          input.scheduleId,
          input.companyId
        )

    const template = resolved.template
    const source = input.sourceOverride || resolved.source

    const ledger = await loadScheduleBillingLedger(supabaseAdmin, input.scheduleId)
    const existingPlan = await loadPlanRow(supabaseAdmin, input.scheduleId)
    const existingInstallments =
      (await loadInstallments(supabaseAdmin, input.scheduleId)) || []

    // Null plan ≡ full_balance: skip rows unless force or non-default type
    if (
      template.type === 'full_balance' &&
      !input.force &&
      !existingPlan &&
      existingInstallments.length === 0
    ) {
      return { ok: true, skipped: true, reason: 'full_balance_default' }
    }

    // Drop plan rows when resetting to full_balance with no money linked
    if (template.type === 'full_balance' && input.force && existingPlan) {
      const { allocatedById } = allocatePaymentsToInstallments(
        existingInstallments,
        ledger.payments
      )
      const hasMoney = existingInstallments.some(
        (i) =>
          (allocatedById.get(i.id) || 0) > MONEY_EPS ||
          ledger.payments.some((p) => p.installment_id === i.id)
      )
      if (!hasMoney && ledger.payments.length === 0) {
        await supabaseAdmin
          .from('billing_installments')
          .delete()
          .eq('schedule_id', input.scheduleId)
        await supabaseAdmin.from('job_payment_plans').delete().eq('id', existingPlan.id)
        return { ok: true, skipped: true, reason: 'cleared_full_balance' }
      }
    }

    const nowIso = new Date().toISOString()
    let planId = existingPlan?.id

    if (!planId) {
      planId = randomUUID()
      const { error: planInsertError } = await supabaseAdmin.from('job_payment_plans').insert({
        id: planId,
        schedule_id: input.scheduleId,
        client_id: input.clientId,
        company_id: input.companyId,
        plan_type: template.type,
        template,
        source,
        allow_pay_ahead: template.allowPayAhead !== false,
        lock_portal_to_due_now: Boolean(template.lockPortalToDueNow),
        needs_attention: false,
        needs_attention_reason: null,
        created_at: nowIso,
        updated_at: nowIso,
      })
      if (planInsertError) {
        if (isMissingTableError(planInsertError)) {
          return { ok: true, skipped: true, reason: 'schema_missing' }
        }
        throw planInsertError
      }
    } else {
      const { error: planUpdateError } = await supabaseAdmin
        .from('job_payment_plans')
        .update({
          plan_type: template.type,
          template,
          source,
          allow_pay_ahead: template.allowPayAhead !== false,
          lock_portal_to_due_now: Boolean(template.lockPortalToDueNow),
          updated_at: nowIso,
        })
        .eq('id', planId)
      if (planUpdateError) throw planUpdateError
    }

    const visitStart = new Date(schedule.start_time)
    const rematerialized = rematerializeInstallments({
      scheduleId: input.scheduleId,
      planId,
      clientId: input.clientId,
      companyId: input.companyId,
      existing: existingInstallments,
      payments: ledger.payments,
      template,
      totalCharged: ledger.totalCharged,
      visitStart,
      newId: () => randomUUID(),
      nowIso,
    })

    await persistInstallments(
      supabaseAdmin,
      rematerialized.installments,
      rematerialized.deletedIds
    )

    await supabaseAdmin
      .from('job_payment_plans')
      .update({
        needs_attention: rematerialized.needsAttention,
        needs_attention_reason: rematerialized.needsAttentionReason,
        updated_at: nowIso,
      })
      .eq('id', planId)

    return {
      ok: true,
      planId,
      needsAttention: rematerialized.needsAttention,
      needsAttentionReason: rematerialized.needsAttentionReason,
      allocatedExistingPayments: ledger.payments.length > 0,
    }
  } catch (error: any) {
    console.error('materializePaymentPlanForSchedule error:', error)
    return { ok: false, error: error?.message || 'Materialize failed' }
  }
}

/** After line-item changes: rebalance amounts + statuses when a plan exists. */
export async function rebalanceJobPaymentPlan(
  supabaseAdmin: SupabaseAdmin,
  scheduleId: string
): Promise<MaterializeResult> {
  if (!isJobPaymentPlansEnabled()) {
    return { ok: true, skipped: true, reason: 'feature_disabled' }
  }

  try {
    const plan = await loadPlanRow(supabaseAdmin, scheduleId)
    if (!plan) return { ok: true, skipped: true, reason: 'no_plan' }

    const installments = await loadInstallments(supabaseAdmin, scheduleId)
    if (!installments?.length) return { ok: true, skipped: true, reason: 'no_installments' }

    const { data: schedule } = await supabaseAdmin
      .from('schedules')
      .select('start_time')
      .eq('id', scheduleId)
      .single()

    const ledger = await loadScheduleBillingLedger(supabaseAdmin, scheduleId)
    const template = normalizeTemplate(plan.template as Partial<JobPaymentPlanTemplate>)
    const expanded = expandTemplate(
      template,
      ledger.totalCharged,
      new Date(schedule?.start_time || Date.now())
    )
    const sharesByKey = sharesFromExpanded(expanded)

    // Include shares for superseded keys still present
    for (const inst of installments) {
      if (!sharesByKey.has(inst.key)) {
        sharesByKey.set(inst.key, { mode: 'remainder' })
      }
    }

    const rebalanced = rebalanceInstallments({
      installments,
      payments: ledger.payments,
      totalCharged: ledger.totalCharged,
      sharesByKey,
    })

    const nowIso = new Date().toISOString()
    await persistInstallments(
      supabaseAdmin,
      rebalanced.installments.map((i) => ({ ...i, updated_at: nowIso })),
      []
    )

    await supabaseAdmin
      .from('job_payment_plans')
      .update({
        needs_attention: rebalanced.needsAttention,
        needs_attention_reason: rebalanced.needsAttentionReason,
        updated_at: nowIso,
      })
      .eq('id', plan.id)

    return {
      ok: true,
      planId: plan.id,
      needsAttention: rebalanced.needsAttention,
      needsAttentionReason: rebalanced.needsAttentionReason,
    }
  } catch (error: any) {
    console.error('rebalanceJobPaymentPlan error:', error)
    return { ok: false, error: error?.message || 'Rebalance failed' }
  }
}

/** Recompute installment statuses after payment insert/delete/refund. */
export async function refreshInstallmentStatuses(
  supabaseAdmin: SupabaseAdmin,
  scheduleId: string
): Promise<void> {
  if (!isJobPaymentPlansEnabled()) return

  try {
    const installments = await loadInstallments(supabaseAdmin, scheduleId)
    if (!installments?.length) return

    const ledger = await loadScheduleBillingLedger(supabaseAdmin, scheduleId)
    const { statuses } = allocatePaymentsToInstallments(installments, ledger.payments)
    const nowIso = new Date().toISOString()

    for (const inst of installments) {
      if (inst.status === 'superseded') continue
      const next = statuses.get(inst.id) || 'pending'
      if (next !== inst.status) {
        await supabaseAdmin
          .from('billing_installments')
          .update({ status: next, updated_at: nowIso })
          .eq('id', inst.id)
      }
    }
  } catch (error) {
    console.error('refreshInstallmentStatuses error:', error)
  }
}

export async function loadJobPaymentPlanProgress(
  supabaseAdmin: SupabaseAdmin,
  scheduleId: string,
  schedule: { status: string; startTime: string }
): Promise<PlanProgressSummary | null> {
  if (!isJobPaymentPlansEnabled()) return null

  const plan = await loadPlanRow(supabaseAdmin, scheduleId)
  if (!plan) return null

  const installments = await loadInstallments(supabaseAdmin, scheduleId)
  if (!installments) return null

  const ledger = await loadScheduleBillingLedger(supabaseAdmin, scheduleId)

  return buildPlanProgressSummary({
    planType: plan.plan_type,
    allowPayAhead: plan.allow_pay_ahead !== false,
    lockPortalToDueNow: Boolean(plan.lock_portal_to_due_now),
    needsAttention: Boolean(plan.needs_attention),
    needsAttentionReason: plan.needs_attention_reason,
    installments,
    payments: ledger.payments,
    totalCharged: ledger.totalCharged,
    totalPaid: ledger.totalPaid,
    schedule: { status: schedule.status, startTime: schedule.startTime },
  })
}

export async function validateManualPaymentAgainstPlan(
  supabaseAdmin: SupabaseAdmin,
  input: {
    scheduleId: string
    amount: number
    installmentId?: string | null
    balanceDue: number
    schedule: { status: string; startTime: string }
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isJobPaymentPlansEnabled()) return { ok: true }

  const plan = await loadPlanRow(supabaseAdmin, input.scheduleId)
  if (!plan) {
    // No plan: ledger clamp only (caller already does balanceDue)
    return { ok: true }
  }

  const installments = (await loadInstallments(supabaseAdmin, input.scheduleId)) || []
  const ledger = await loadScheduleBillingLedger(supabaseAdmin, input.scheduleId)
  const progress = buildPlanProgressSummary({
    planType: plan.plan_type,
    allowPayAhead: plan.allow_pay_ahead !== false,
    lockPortalToDueNow: Boolean(plan.lock_portal_to_due_now),
    needsAttention: Boolean(plan.needs_attention),
    needsAttentionReason: plan.needs_attention_reason,
    installments,
    payments: ledger.payments,
    totalCharged: ledger.totalCharged,
    totalPaid: ledger.totalPaid,
    schedule: input.schedule,
  })

  let targetRemaining: number | null = null
  let targetSuperseded = false
  if (input.installmentId) {
    const inst = installments.find((i) => i.id === input.installmentId)
    if (!inst) return { ok: false, error: 'Installment not found on this job' }
    if (inst.status === 'superseded') {
      targetSuperseded = true
    } else {
      const row = progress.installments.find((i) => i.id === inst.id)
      targetRemaining = row?.remaining ?? 0
    }
  }

  return validatePaymentAmount({
    amount: input.amount,
    balanceDue: input.balanceDue,
    maxPayableNow: progress.maxPayableNow,
    allowPayAhead: plan.allow_pay_ahead !== false,
    targetRemaining,
    targetSuperseded,
  })
}

export type SetJobPaymentPlanInput = {
  scheduleId: string
  clientId: string
  companyId: string
  template: JobPaymentPlanTemplate
  applyMode: 'this_visit' | 'all_future'
  includeCustomized?: boolean
  confirmReallocate?: boolean
}

export type SetJobPaymentPlanResult = {
  success: boolean
  error?: string
  allocatedExistingPayments?: boolean
  allFuture?: AllFutureCounts
}

/**
 * Staff sets a plan.
 * - this_visit: materialize primary as job_override; do not touch recurring_rules
 * - all_future: snapshot series template + K8 matrix on siblings (series_default)
 */
export async function setJobPaymentPlan(
  supabaseAdmin: SupabaseAdmin,
  input: SetJobPaymentPlanInput
): Promise<SetJobPaymentPlanResult> {
  if (!isJobPaymentPlansEnabled()) {
    return { success: false, error: 'Payment plans are disabled' }
  }

  const template = normalizeTemplate(input.template)
  const applyAllFuture = input.applyMode === 'all_future'
  // K19: first plan attach with existing payments proceeds (FIFO allocate + UI note via flag)
  // all_future primary uses series_default so it stays aligned with the series snapshot
  const primarySource: PlanSource = applyAllFuture ? 'series_default' : 'job_override'

  const primary = await materializePaymentPlanForSchedule(supabaseAdmin, {
    scheduleId: input.scheduleId,
    clientId: input.clientId,
    companyId: input.companyId,
    force: true,
    templateOverride: template,
    sourceOverride: primarySource,
  })

  if (!primary.ok) {
    return { success: false, error: primary.error || 'Could not set payment plan' }
  }

  if (!applyAllFuture) {
    return {
      success: true,
      allocatedExistingPayments: Boolean(primary.allocatedExistingPayments),
    }
  }

  const { data: schedule } = await supabaseAdmin
    .from('schedules')
    .select('recurring_rule_id, start_time')
    .eq('id', input.scheduleId)
    .single()

  if (!schedule?.recurring_rule_id) {
    return {
      success: true,
      allocatedExistingPayments: Boolean(primary.allocatedExistingPayments),
      allFuture: emptyAllFutureCounts(),
    }
  }

  // Snapshot series template (new instances + live inherit for un-overridden visits)
  const { error: seriesError } = await supabaseAdmin
    .from('recurring_rules')
    .update({ payment_plan_template: template })
    .eq('id', schedule.recurring_rule_id)
  if (seriesError) {
    if (!isMissingTableError(seriesError)) {
      console.error('setJobPaymentPlan series template error:', seriesError)
      return {
        success: false,
        error: seriesError.message || 'Could not update series payment plan',
      }
    }
  }

  const { data: siblings } = await supabaseAdmin
    .from('schedules')
    .select('id, client_id, start_time, status')
    .eq('recurring_rule_id', schedule.recurring_rule_id)
    .in('status', ['scheduled', 'in_progress'])

  const siblingList = siblings || []
  const siblingIds = siblingList.map((s) => s.id)

  const paidScheduleIds = new Set<string>()
  const planSourceBySchedule = new Map<string, string>()

  if (siblingIds.length > 0) {
    const [{ data: payRows }, { data: planRows }] = await Promise.all([
      supabaseAdmin
        .from('billing_payments')
        .select('schedule_id')
        .in('schedule_id', siblingIds),
      supabaseAdmin
        .from('job_payment_plans')
        .select('schedule_id, source')
        .in('schedule_id', siblingIds),
    ])
    for (const row of payRows || []) {
      if (row.schedule_id) paidScheduleIds.add(row.schedule_id)
    }
    for (const row of planRows || []) {
      if (row.schedule_id) planSourceBySchedule.set(row.schedule_id, row.source)
    }
  }

  const nowMs = Date.now()
  let counts = emptyAllFutureCounts()
  const includeCustomized = Boolean(input.includeCustomized)

  for (const sib of siblingList) {
    const decision = classifyAllFutureInstance({
      isPrimary: sib.id === input.scheduleId,
      status: sib.status,
      startTimeMs: new Date(sib.start_time).getTime(),
      nowMs,
      hasPayments: paidScheduleIds.has(sib.id),
      planSource: planSourceBySchedule.get(sib.id) ?? null,
      includeCustomized,
    })

    if (decision === 'update') {
      const result = await materializePaymentPlanForSchedule(supabaseAdmin, {
        scheduleId: sib.id,
        clientId: sib.client_id,
        companyId: input.companyId,
        force: true,
        templateOverride: template,
        sourceOverride: 'series_default',
      })
      if (result.ok) {
        // Count as updated even if materialize skipped (e.g. full_balance cleared) —
        // series template was applied / reconciled for this visit.
        counts = tallyAllFutureDecision(counts, 'update')
      }
      // if materialize failed, do not tally as updated or as a skip
      continue
    }

    counts = tallyAllFutureDecision(counts, decision)
  }

  return {
    success: true,
    allocatedExistingPayments: Boolean(primary.allocatedExistingPayments),
    allFuture: counts,
  }
}

export async function resetJobPaymentPlan(
  supabaseAdmin: SupabaseAdmin,
  input: {
    scheduleId: string
    clientId: string
    companyId: string
    confirmReallocate?: boolean
  }
): Promise<SetJobPaymentPlanResult> {
  if (!isJobPaymentPlansEnabled()) {
    return { success: false, error: 'Payment plans are disabled' }
  }

  const ledger = await loadScheduleBillingLedger(supabaseAdmin, input.scheduleId)
  if (ledger.payments.length > 0 && !input.confirmReallocate) {
    return {
      success: false,
      error: 'This job has payments. Confirm reallocation to reset the plan.',
    }
  }

  const { template, source } = await resolveTemplateForSchedule(
    supabaseAdmin,
    input.scheduleId,
    input.companyId
  )

  const result = await materializePaymentPlanForSchedule(supabaseAdmin, {
    scheduleId: input.scheduleId,
    clientId: input.clientId,
    companyId: input.companyId,
    force: true,
    templateOverride: template,
    sourceOverride: source,
  })

  if (!result.ok) {
    return { success: false, error: result.error || 'Could not reset payment plan' }
  }

  return {
    success: true,
    allocatedExistingPayments: Boolean(result.allocatedExistingPayments),
  }
}

/** Load company settings (for settings UI / actions). */
export async function getCompanyJobPaymentSettings(
  supabaseAdmin: SupabaseAdmin,
  companyId: string
) {
  const { data } = await supabaseAdmin
    .from('companies')
    .select('job_payment_settings')
    .eq('id', companyId)
    .maybeSingle()

  return parseCompanyJobPaymentSettings(data?.job_payment_settings)
}

export async function updateCompanyJobPaymentSettings(
  supabaseAdmin: SupabaseAdmin,
  companyId: string,
  settings: { defaultPlan: JobPaymentPlanTemplate }
) {
  const normalized = {
    defaultPlan: normalizeTemplate(settings.defaultPlan),
  }
  const { error } = await supabaseAdmin
    .from('companies')
    .update({ job_payment_settings: normalized })
    .eq('id', companyId)
  if (error) throw error
  return normalized
}

/**
 * Staff re-link: set or clear billing_payments.installment_id on the same schedule, then re-allocate.
 */
export async function relinkBillingPaymentInstallment(
  supabaseAdmin: SupabaseAdmin,
  input: {
    paymentId: string
    scheduleId: string
    installmentId: string | null
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isJobPaymentPlansEnabled()) {
    return { ok: false, error: 'Payment plans are disabled' }
  }

  const { data: payment, error: payError } = await supabaseAdmin
    .from('billing_payments')
    .select('id, schedule_id, installment_id')
    .eq('id', input.paymentId)
    .eq('schedule_id', input.scheduleId)
    .maybeSingle()

  if (payError || !payment) {
    return { ok: false, error: 'Payment not found on this job' }
  }

  if (input.installmentId) {
    const { data: inst, error: instError } = await supabaseAdmin
      .from('billing_installments')
      .select('id, schedule_id')
      .eq('id', input.installmentId)
      .eq('schedule_id', input.scheduleId)
      .maybeSingle()

    if (instError || !inst) {
      return { ok: false, error: 'Installment not found on this job' }
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('billing_payments')
    .update({ installment_id: input.installmentId })
    .eq('id', input.paymentId)
    .eq('schedule_id', input.scheduleId)

  if (updateError) {
    if (isMissingTableError(updateError)) {
      return { ok: false, error: 'Payment plan schema is not applied yet' }
    }
    return { ok: false, error: updateError.message || 'Could not update payment link' }
  }

  await refreshInstallmentStatuses(supabaseAdmin, input.scheduleId)
  return { ok: true }
}

// re-export for callers that need money rounding
export { roundMoney }
