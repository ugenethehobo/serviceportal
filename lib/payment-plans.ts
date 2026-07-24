/**
 * Pure domain helpers for job payment plans / installments.
 * DB I/O lives in payment-plans-server. See design-flexible-multi-payment-billing.md.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobPaymentPlanType =
  | 'full_balance'
  | 'deposit_remainder'
  | 'custom_installments'

export type DepositSpec =
  | { mode: 'percent'; percent: number }
  | { mode: 'fixed'; amount: number }

export type InstallmentShare =
  | { mode: 'percent'; percent: number }
  | { mode: 'fixed'; amount: number }
  | { mode: 'remainder' }

export type CollectiblePolicy =
  | { when: 'anytime' }
  | { when: 'on_or_after_visit_start' }
  | { when: 'on_or_after_job_complete' }
  | { when: 'relative_days'; daysBeforeStart: number }

export type InstallmentTemplate = {
  key: string
  label: string
  share: InstallmentShare
  collectible: CollectiblePolicy
  dueOffsetDays?: number | null
}

export type JobPaymentPlanTemplate = {
  version: 1
  type: JobPaymentPlanType
  deposit?: DepositSpec
  installments?: InstallmentTemplate[]
  lockPortalToDueNow?: boolean
  allowPayAhead?: boolean
}

export type CompanyJobPaymentSettings = {
  defaultPlan: JobPaymentPlanTemplate
}

export type InstallmentStatus = 'pending' | 'partial' | 'paid' | 'superseded'

export type BillingInstallment = {
  id: string
  schedule_id: string
  job_payment_plan_id: string
  client_id: string
  company_id: string
  sequence: number
  key: string
  label: string
  amount_due: number
  due_date: string | null
  collectible_policy: CollectiblePolicy
  status: InstallmentStatus
  created_at: string
  updated_at: string
}

export type PaymentForAllocation = {
  id: string
  amount: number
  payment_date: string
  created_at: string
  installment_id?: string | null
}

export type ExpandedInstallment = {
  key: string
  label: string
  sequence: number
  amount_due: number
  collectible_policy: CollectiblePolicy
  due_date: string | null
  share: InstallmentShare
}

export type PlanProgressSummary = {
  planType: JobPaymentPlanType
  allowPayAhead: boolean
  lockPortalToDueNow: boolean
  needsAttention: boolean
  needsAttentionReason: string | null
  amountDueNow: number
  maxPayableNow: number
  amountPaidOnPlan: number
  nextInstallment: { id: string; label: string; remaining: number } | null
  installments: Array<{
    id: string
    key: string
    label: string
    sequence: number
    amountDue: number
    amountPaid: number
    remaining: number
    status: InstallmentStatus
    collectibleNow: boolean
    dueDate: string | null
  }>
  hasCollectibleNow: boolean
}

export type CanPayInput = {
  balanceDue: number
  lineItemCount: number
  billable: boolean
  plan: {
    allowPayAhead: boolean
    amountDueNow: number
    hasCollectibleNow: boolean
  } | null
}

export const MONEY_EPS = 0.009
export const STRIPE_MIN_USD = 0.5

export const DEFAULT_FULL_BALANCE_TEMPLATE: JobPaymentPlanTemplate = {
  version: 1,
  type: 'full_balance',
  allowPayAhead: true,
  lockPortalToDueNow: false,
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function moneyEq(a: number, b: number): boolean {
  return Math.abs(a - b) <= MONEY_EPS
}

export function moneyGte(a: number, b: number): boolean {
  return a + MONEY_EPS >= b
}

// ---------------------------------------------------------------------------
// Settings / template parsing
// ---------------------------------------------------------------------------

export function defaultCompanyJobPaymentSettings(): CompanyJobPaymentSettings {
  return { defaultPlan: { ...DEFAULT_FULL_BALANCE_TEMPLATE } }
}

export function parseCompanyJobPaymentSettings(
  raw: unknown
): CompanyJobPaymentSettings {
  if (!raw || typeof raw !== 'object') {
    return defaultCompanyJobPaymentSettings()
  }
  const obj = raw as Record<string, unknown>
  const plan = obj.defaultPlan
  if (!plan || typeof plan !== 'object') {
    return defaultCompanyJobPaymentSettings()
  }
  const parsed = normalizeTemplate(plan as Partial<JobPaymentPlanTemplate>)
  return { defaultPlan: parsed }
}

export function normalizeTemplate(
  raw: Partial<JobPaymentPlanTemplate> | null | undefined
): JobPaymentPlanTemplate {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_FULL_BALANCE_TEMPLATE }
  }
  const type = (raw.type || 'full_balance') as JobPaymentPlanType
  const base: JobPaymentPlanTemplate = {
    version: 1,
    type:
      type === 'deposit_remainder' || type === 'custom_installments'
        ? type
        : 'full_balance',
    allowPayAhead: raw.allowPayAhead !== false,
    lockPortalToDueNow: Boolean(raw.lockPortalToDueNow),
  }
  if (base.type === 'deposit_remainder' && raw.deposit) {
    base.deposit = raw.deposit
  } else if (base.type === 'deposit_remainder') {
    base.deposit = { mode: 'percent', percent: 50 }
  }
  if (base.type === 'custom_installments' && Array.isArray(raw.installments)) {
    base.installments = raw.installments
  }
  return base
}

export function resolveEffectiveTemplate(input: {
  companySettings: unknown
  seriesTemplate: unknown | null
}): JobPaymentPlanTemplate {
  if (input.seriesTemplate != null) {
    return normalizeTemplate(input.seriesTemplate as Partial<JobPaymentPlanTemplate>)
  }
  return parseCompanyJobPaymentSettings(input.companySettings).defaultPlan
}

// ---------------------------------------------------------------------------
// Expand template → installment drafts
// ---------------------------------------------------------------------------

function ymdFromVisit(visitStart: Date, offsetDays: number | null | undefined): string | null {
  if (offsetDays == null || Number.isNaN(offsetDays)) return null
  const d = new Date(visitStart.getTime())
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export function expandTemplate(
  template: JobPaymentPlanTemplate,
  totalCharged: number,
  visitStart: Date
): ExpandedInstallment[] {
  const total = Math.max(0, roundMoney(totalCharged))
  const t = normalizeTemplate(template)

  if (t.type === 'full_balance') {
    return [
      {
        key: 'balance',
        label: 'Balance due',
        sequence: 1,
        amount_due: total,
        collectible_policy: { when: 'on_or_after_visit_start' },
        due_date: null,
        share: { mode: 'remainder' },
      },
    ]
  }

  if (t.type === 'deposit_remainder') {
    const deposit = t.deposit || { mode: 'percent' as const, percent: 50 }
    let depositAmt = 0
    if (deposit.mode === 'percent') {
      const pct = Math.min(99, Math.max(1, Number(deposit.percent) || 50))
      depositAmt = roundMoney((total * pct) / 100)
    } else {
      depositAmt = roundMoney(Math.min(Math.max(0, Number(deposit.amount) || 0), total))
    }
    const remainder = roundMoney(total - depositAmt)
    return [
      {
        key: 'deposit',
        label: 'Down payment',
        sequence: 1,
        amount_due: depositAmt,
        collectible_policy: { when: 'anytime' },
        due_date: null,
        share:
          deposit.mode === 'percent'
            ? { mode: 'percent', percent: Math.min(99, Math.max(1, Number(deposit.percent) || 50)) }
            : { mode: 'fixed', amount: depositAmt },
      },
      {
        key: 'remainder',
        label: 'Remaining balance',
        sequence: 2,
        amount_due: remainder,
        collectible_policy: { when: 'on_or_after_visit_start' },
        due_date: null,
        share: { mode: 'remainder' },
      },
    ]
  }

  // custom_installments
  const items = t.installments || []
  if (items.length === 0) {
    return expandTemplate({ ...DEFAULT_FULL_BALANCE_TEMPLATE }, total, visitStart)
  }

  const remainderCount = items.filter((i) => i.share.mode === 'remainder').length
  if (remainderCount !== 1) {
    throw new Error('custom_installments requires exactly one remainder share')
  }

  let assigned = 0
  const expanded: ExpandedInstallment[] = []

  items.forEach((item, idx) => {
    const sequence = idx + 1
    let amount = 0
    if (item.share.mode === 'percent') {
      amount = roundMoney((total * Number(item.share.percent)) / 100)
    } else if (item.share.mode === 'fixed') {
      amount = roundMoney(Number(item.share.amount) || 0)
    } else {
      amount = 0 // filled after
    }
    if (item.share.mode !== 'remainder') {
      assigned = roundMoney(assigned + amount)
    }
    expanded.push({
      key: item.key,
      label: item.label,
      sequence,
      amount_due: amount,
      collectible_policy: item.collectible || { when: 'on_or_after_visit_start' },
      due_date: ymdFromVisit(visitStart, item.dueOffsetDays),
      share: item.share,
    })
  })

  const remIdx = expanded.findIndex((e) => e.share.mode === 'remainder')
  if (assigned > total + MONEY_EPS) {
    throw new Error('custom_installments fixed/percent shares exceed totalCharged')
  }
  expanded[remIdx].amount_due = roundMoney(total - assigned)

  return expanded
}

// ---------------------------------------------------------------------------
// Collectibility
// ---------------------------------------------------------------------------

export function isInstallmentCollectible(
  policy: CollectiblePolicy,
  schedule: { status: string; startTime: string },
  now = new Date()
): boolean {
  if (schedule.status === 'cancelled') return false
  const startMs = new Date(schedule.startTime).getTime()
  const nowMs = now.getTime()

  switch (policy.when) {
    case 'anytime':
      return true
    case 'on_or_after_visit_start':
      if (schedule.status === 'archived' || schedule.status === 'in_progress') return true
      return startMs <= nowMs
    case 'on_or_after_job_complete':
      return schedule.status === 'archived'
    case 'relative_days': {
      const days = Number(policy.daysBeforeStart) || 0
      const openAt = startMs - days * 24 * 60 * 60 * 1000
      return nowMs >= openAt
    }
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

export function sortPaymentsForAllocation<T extends PaymentForAllocation>(payments: T[]): T[] {
  return [...payments].sort((a, b) => {
    if (a.payment_date !== b.payment_date) {
      return a.payment_date < b.payment_date ? -1 : 1
    }
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? -1 : 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export type AllocationResult = {
  allocatedById: Map<string, number>
  statuses: Map<string, InstallmentStatus>
}

export function allocatePaymentsToInstallments(
  installments: BillingInstallment[],
  payments: PaymentForAllocation[]
): AllocationResult {
  const byId = new Map(installments.map((i) => [i.id, i]))
  const remaining = new Map<string, number>()
  const allocated = new Map<string, number>()

  for (const inst of installments) {
    remaining.set(inst.id, roundMoney(Number(inst.amount_due)))
    allocated.set(inst.id, 0)
  }

  const open = installments
    .filter((i) => i.status !== 'superseded')
    .sort((a, b) => a.sequence - b.sequence)

  const applyTo = (instId: string, amount: number): number => {
    const rem = remaining.get(instId) ?? 0
    const take = roundMoney(Math.min(amount, Math.max(0, rem)))
    if (take > 0) {
      allocated.set(instId, roundMoney((allocated.get(instId) || 0) + take))
      remaining.set(instId, roundMoney(rem - take))
    }
    return take
  }

  const spillFifo = (spill: number) => {
    let left = roundMoney(spill)
    for (const inst of open) {
      if (left <= MONEY_EPS) break
      const taken = applyTo(inst.id, left)
      left = roundMoney(left - taken)
    }
  }

  for (const p of sortPaymentsForAllocation(payments)) {
    const amount = roundMoney(Number(p.amount))
    if (amount <= 0) continue

    if (p.installment_id) {
      const target = byId.get(p.installment_id)
      if (!target) {
        spillFifo(amount)
        continue
      }
      // Linked payments credit the target even if superseded (audit)
      const take = applyTo(target.id, amount)
      const spill = roundMoney(amount - take)
      if (spill > MONEY_EPS) spillFifo(spill)
    } else {
      spillFifo(amount)
    }
  }

  const statuses = new Map<string, InstallmentStatus>()
  for (const inst of installments) {
    if (inst.status === 'superseded') {
      statuses.set(inst.id, 'superseded')
      continue
    }
    const paid = allocated.get(inst.id) || 0
    const due = Number(inst.amount_due)
    if (moneyGte(paid, due) && due > 0) {
      statuses.set(inst.id, 'paid')
    } else if (paid > MONEY_EPS) {
      statuses.set(inst.id, 'partial')
    } else if (due <= MONEY_EPS && moneyGte(paid, due)) {
      statuses.set(inst.id, due <= MONEY_EPS ? 'paid' : 'pending')
    } else {
      statuses.set(inst.id, 'pending')
    }
    // Zero-due open installment with no pay: paid if due is 0
    if (due <= MONEY_EPS && paid <= MONEY_EPS) {
      statuses.set(inst.id, 'paid')
    }
  }

  return { allocatedById: allocated, statuses }
}

// ---------------------------------------------------------------------------
// Rebalance
// ---------------------------------------------------------------------------

export type RebalanceResult = {
  installments: BillingInstallment[]
  needsAttention: boolean
  needsAttentionReason: string | null
}

/**
 * Split the open (unfrozen) pool across open installments.
 * Percent shares are absolute percent of the job total (same base as expandTemplate),
 * not relative weights among percent-only rows — otherwise a single 30% deposit
 * with a remainder would incorrectly claim 100% of the pool.
 */
function distributeOpenPool(
  open: BillingInstallment[],
  shares: Map<string, InstallmentShare>,
  openPool: number,
  totalCharged: number
): Map<string, number> {
  const amounts = new Map<string, number>()
  if (open.length === 0) return amounts

  let pool = Math.max(0, roundMoney(openPool))
  const jobTotal = Math.max(0, roundMoney(totalCharged))
  const ordered = [...open].sort((a, b) => a.sequence - b.sequence)

  // Fixed first (sequence order), then absolute percent of job total, remainder last
  let fixedUsed = 0
  for (const inst of ordered) {
    const share = shares.get(inst.key) || { mode: 'remainder' as const }
    if (share.mode === 'fixed') {
      const want = roundMoney(Number(share.amount) || 0)
      const give = roundMoney(Math.min(want, Math.max(0, pool - fixedUsed)))
      amounts.set(inst.id, give)
      fixedUsed = roundMoney(fixedUsed + give)
    }
  }

  let afterFixed = roundMoney(Math.max(0, pool - fixedUsed))
  const percentItems = ordered.filter((i) => {
    const s = shares.get(i.key)
    return s?.mode === 'percent'
  })
  const remainderItems = ordered.filter((i) => {
    const s = shares.get(i.key)
    return !s || s.mode === 'remainder'
  })

  let percentAssigned = 0
  if (percentItems.length > 0) {
    for (let i = 0; i < percentItems.length; i++) {
      const inst = percentItems[i]
      const sh = shares.get(inst.key)!
      const pct = sh.mode === 'percent' ? Number(sh.percent) || 0 : 0
      const remainingAfterPrior = roundMoney(Math.max(0, afterFixed - percentAssigned))
      let give = 0
      if (i === percentItems.length - 1 && remainderItems.length === 0) {
        // No remainder row: last percent absorbs residual of the open pool
        give = remainingAfterPrior
      } else {
        const want = roundMoney((jobTotal * pct) / 100)
        give = roundMoney(Math.min(want, remainingAfterPrior))
      }
      amounts.set(inst.id, give)
      percentAssigned = roundMoney(percentAssigned + give)
    }
  }

  let used = roundMoney(fixedUsed + percentAssigned)
  const remPool = roundMoney(Math.max(0, pool - used))
  if (remainderItems.length > 0) {
    // Only last remainder gets residual (normative: one remainder key)
    for (let i = 0; i < remainderItems.length; i++) {
      const inst = remainderItems[i]
      if (i === remainderItems.length - 1) {
        amounts.set(inst.id, remPool)
      } else {
        amounts.set(inst.id, 0)
      }
    }
  } else if (ordered.length > 0 && remPool > MONEY_EPS) {
    // No remainder share: dump residual on last open
    const last = ordered[ordered.length - 1]
    amounts.set(last.id, roundMoney((amounts.get(last.id) || 0) + remPool))
  }

  // Ensure every open has an entry
  for (const inst of ordered) {
    if (!amounts.has(inst.id)) amounts.set(inst.id, 0)
  }

  return amounts
}

export function rebalanceInstallments(input: {
  installments: BillingInstallment[]
  payments: PaymentForAllocation[]
  totalCharged: number
  /** Share definitions by installment key (from template expand) */
  sharesByKey: Map<string, InstallmentShare>
}): RebalanceResult {
  const totalCharged = roundMoney(Math.max(0, input.totalCharged))
  const { allocatedById } = allocatePaymentsToInstallments(
    input.installments,
    input.payments
  )

  const working = input.installments.map((i) => ({ ...i }))

  // Apply freeze floors
  for (const inst of working) {
    const paid = allocatedById.get(inst.id) || 0
    if (inst.status === 'superseded' || paid > MONEY_EPS) {
      inst.amount_due = roundMoney(Math.max(Number(inst.amount_due), paid))
    }
  }

  // Claimed = floors on superseded + any installment with allocatedPaid > 0
  let claimed = 0
  for (const inst of working) {
    const paid = allocatedById.get(inst.id) || 0
    if (inst.status === 'superseded' || paid > MONEY_EPS) {
      claimed = roundMoney(claimed + Number(inst.amount_due))
    }
  }

  const openPool = roundMoney(totalCharged - claimed)
  let needsAttention = false
  let needsAttentionReason: string | null = null

  const open = working.filter((i) => {
    const paid = allocatedById.get(i.id) || 0
    return i.status !== 'superseded' && paid <= MONEY_EPS
  })

  if (openPool < -MONEY_EPS) {
    needsAttention = true
    needsAttentionReason = 'Payments exceed revised job total'
    for (const inst of open) {
      inst.amount_due = 0
    }
  } else {
    const distributed = distributeOpenPool(
      open,
      input.sharesByKey,
      openPool,
      totalCharged
    )
    for (const inst of open) {
      inst.amount_due = distributed.get(inst.id) ?? 0
    }
  }

  // totalPaid check
  const totalPaid = roundMoney(
    input.payments.reduce((s, p) => s + Number(p.amount), 0)
  )
  if (totalPaid > totalCharged + MONEY_EPS) {
    needsAttention = true
    needsAttentionReason =
      needsAttentionReason || 'Payments exceed revised job total'
  }

  // Re-allocate statuses after amount changes
  const { statuses } = allocatePaymentsToInstallments(working, input.payments)
  for (const inst of working) {
    if (inst.status !== 'superseded') {
      inst.status = statuses.get(inst.id) || 'pending'
    }
  }

  // Sum invariant check
  const sumDue = roundMoney(working.reduce((s, i) => s + Number(i.amount_due), 0))
  if (!needsAttention && !moneyEq(sumDue, totalCharged) && totalCharged > MONEY_EPS) {
    // Tolerate when only superseded floors + open don't match due to rounding
    if (Math.abs(sumDue - totalCharged) > 0.02) {
      needsAttention = true
      needsAttentionReason =
        needsAttentionReason || 'Installment amounts do not match job total'
    }
  }

  if (
    !needsAttention &&
    totalCharged >= totalPaid - MONEY_EPS &&
    (moneyEq(sumDue, totalCharged) || totalCharged <= MONEY_EPS)
  ) {
    needsAttention = false
    needsAttentionReason = null
  }

  return { installments: working, needsAttention, needsAttentionReason }
}

// ---------------------------------------------------------------------------
// Durable rematerialize (pure)
// ---------------------------------------------------------------------------

export type RematerializeInput = {
  scheduleId: string
  planId: string
  clientId: string
  companyId: string
  existing: BillingInstallment[]
  payments: PaymentForAllocation[]
  template: JobPaymentPlanTemplate
  totalCharged: number
  visitStart: Date
  /** Generate new UUID when inserting */
  newId: () => string
  nowIso?: string
}

export type RematerializeResult = {
  installments: BillingInstallment[]
  deletedIds: string[]
  needsAttention: boolean
  needsAttentionReason: string | null
  sharesByKey: Map<string, InstallmentShare>
}

function findByKey(
  existing: BillingInstallment[],
  key: string
): BillingInstallment | null {
  const active = existing.find((i) => i.key === key && i.status !== 'superseded')
  if (active) return active
  const superseded = existing
    .filter((i) => i.key === key && i.status === 'superseded')
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
  return superseded[0] || null
}

export function rematerializeInstallments(
  input: RematerializeInput
): RematerializeResult {
  const nowIso = input.nowIso || new Date().toISOString()
  const desired = expandTemplate(
    input.template,
    input.totalCharged,
    input.visitStart
  )
  const desiredKeys = new Set(desired.map((d) => d.key))
  const sharesByKey = new Map(desired.map((d) => [d.key, d.share]))

  let working = input.existing.map((i) => ({ ...i }))
  const deletedIds: string[] = []

  // 1. Upsert desired keys (un-supersede-by-key)
  for (const d of desired) {
    const found = findByKey(working, d.key)
    if (found) {
      found.key = d.key
      found.label = d.label
      found.sequence = d.sequence
      found.collectible_policy = d.collectible_policy
      found.due_date = d.due_date
      found.job_payment_plan_id = input.planId
      if (found.status === 'superseded') {
        found.status = 'pending'
      }
      found.updated_at = nowIso
      // amount_due set by rebalance
      if (!sharesByKey.has(found.key)) {
        sharesByKey.set(found.key, d.share)
      }
    } else {
      working.push({
        id: input.newId(),
        schedule_id: input.scheduleId,
        job_payment_plan_id: input.planId,
        client_id: input.clientId,
        company_id: input.companyId,
        sequence: d.sequence,
        key: d.key,
        label: d.label,
        amount_due: d.amount_due,
        due_date: d.due_date,
        collectible_policy: d.collectible_policy,
        status: 'pending',
        created_at: nowIso,
        updated_at: nowIso,
      })
    }
  }

  // 2. Active keys not in desired
  const linkedIds = new Set(
    input.payments
      .map((p) => p.installment_id)
      .filter((id): id is string => Boolean(id))
  )
  const preAlloc = allocatePaymentsToInstallments(working, input.payments)

  const next: BillingInstallment[] = []
  for (const e of working) {
    if (e.status === 'superseded') {
      next.push(e)
      continue
    }
    if (desiredKeys.has(e.key)) {
      next.push(e)
      continue
    }
    const paid = preAlloc.allocatedById.get(e.id) || 0
    if (linkedIds.has(e.id) || paid > MONEY_EPS) {
      e.status = 'superseded'
      e.amount_due = roundMoney(Math.max(Number(e.amount_due), paid))
      e.updated_at = nowIso
      next.push(e)
    } else {
      deletedIds.push(e.id)
    }
  }
  working = next

  // Ensure shares for superseded keys exist for rebalance (floor only)
  for (const inst of working) {
    if (!sharesByKey.has(inst.key)) {
      sharesByKey.set(inst.key, { mode: 'remainder' })
    }
  }

  const rebalanced = rebalanceInstallments({
    installments: working,
    payments: input.payments,
    totalCharged: input.totalCharged,
    sharesByKey,
  })

  return {
    installments: rebalanced.installments,
    deletedIds,
    needsAttention: rebalanced.needsAttention,
    needsAttentionReason: rebalanced.needsAttentionReason,
    sharesByKey,
  }
}

// ---------------------------------------------------------------------------
// Payable amounts / canPay
// ---------------------------------------------------------------------------

export function remainingOnInstallment(
  inst: BillingInstallment,
  allocatedPaid: number
): number {
  return roundMoney(Math.max(0, Number(inst.amount_due) - allocatedPaid))
}

export function computePlanPayable(input: {
  installments: BillingInstallment[]
  payments: PaymentForAllocation[]
  totalCharged: number
  totalPaid: number
  allowPayAhead: boolean
  schedule: { status: string; startTime: string }
  now?: Date
}): {
  balanceDue: number
  amountDueNow: number
  maxPayableNow: number
  hasCollectibleNow: boolean
  allocatedById: Map<string, number>
} {
  const balanceDue = roundMoney(input.totalCharged - input.totalPaid)
  const { allocatedById } = allocatePaymentsToInstallments(
    input.installments,
    input.payments
  )
  const now = input.now || new Date()

  let amountDueNow = 0
  let hasCollectibleNow = false

  for (const inst of input.installments) {
    if (inst.status === 'superseded') continue
    const paid = allocatedById.get(inst.id) || 0
    const rem = remainingOnInstallment(inst, paid)
    if (rem <= MONEY_EPS) continue
    const collectible = isInstallmentCollectible(
      inst.collectible_policy,
      input.schedule,
      now
    )
    if (collectible) {
      hasCollectibleNow = true
      amountDueNow = roundMoney(amountDueNow + rem)
    }
  }

  // Cap amountDueNow by ledger
  amountDueNow = roundMoney(Math.min(amountDueNow, Math.max(0, balanceDue)))

  const maxPayableNow = input.allowPayAhead
    ? Math.max(0, balanceDue)
    : amountDueNow

  return {
    balanceDue,
    amountDueNow,
    maxPayableNow: roundMoney(Math.min(maxPayableNow, Math.max(0, balanceDue))),
    hasCollectibleNow,
    allocatedById,
  }
}

export function computeImplicitFullBalancePayable(input: {
  totalCharged: number
  totalPaid: number
  billable: boolean
}): {
  balanceDue: number
  amountDueNow: number
  maxPayableNow: number
  hasCollectibleNow: boolean
} {
  const balanceDue = roundMoney(input.totalCharged - input.totalPaid)
  const amountDueNow =
    input.billable && balanceDue > MONEY_EPS ? Math.max(0, balanceDue) : 0
  return {
    balanceDue,
    amountDueNow,
    maxPayableNow: amountDueNow,
    hasCollectibleNow: amountDueNow > MONEY_EPS,
  }
}

export function computeCanPay(input: CanPayInput): boolean {
  if (input.balanceDue <= MONEY_EPS) return false
  if (input.lineItemCount <= 0) return false
  if (!input.plan) {
    return input.billable && input.balanceDue > MONEY_EPS
  }
  return (
    input.plan.amountDueNow > MONEY_EPS ||
    (input.plan.allowPayAhead &&
      input.plan.hasCollectibleNow &&
      input.balanceDue > MONEY_EPS)
  )
}

export function buildPlanProgressSummary(input: {
  planType: JobPaymentPlanType
  allowPayAhead: boolean
  lockPortalToDueNow: boolean
  needsAttention: boolean
  needsAttentionReason: string | null
  installments: BillingInstallment[]
  payments: PaymentForAllocation[]
  totalCharged: number
  totalPaid: number
  schedule: { status: string; startTime: string }
  now?: Date
}): PlanProgressSummary {
  const payable = computePlanPayable({
    installments: input.installments,
    payments: input.payments,
    totalCharged: input.totalCharged,
    totalPaid: input.totalPaid,
    allowPayAhead: input.allowPayAhead,
    schedule: input.schedule,
    now: input.now,
  })

  const rows = input.installments
    .filter((i) => i.status !== 'superseded')
    .sort((a, b) => a.sequence - b.sequence)
    .map((inst) => {
      const amountPaid = payable.allocatedById.get(inst.id) || 0
      const remaining = remainingOnInstallment(inst, amountPaid)
      const collectibleNow = isInstallmentCollectible(
        inst.collectible_policy,
        input.schedule,
        input.now
      )
      return {
        id: inst.id,
        key: inst.key,
        label: inst.label,
        sequence: inst.sequence,
        amountDue: Number(inst.amount_due),
        amountPaid,
        remaining,
        status: inst.status,
        collectibleNow,
        dueDate: inst.due_date,
      }
    })

  const next =
    rows.find((r) => r.remaining > MONEY_EPS && r.collectibleNow) ||
    rows.find((r) => r.remaining > MONEY_EPS) ||
    null

  const amountPaidOnPlan = roundMoney(
    rows.reduce((s, r) => s + r.amountPaid, 0)
  )

  return {
    planType: input.planType,
    allowPayAhead: input.allowPayAhead,
    lockPortalToDueNow: input.lockPortalToDueNow,
    needsAttention: input.needsAttention,
    needsAttentionReason: input.needsAttentionReason,
    amountDueNow: payable.amountDueNow,
    maxPayableNow: payable.maxPayableNow,
    amountPaidOnPlan,
    nextInstallment: next
      ? { id: next.id, label: next.label, remaining: next.remaining }
      : null,
    installments: rows,
    hasCollectibleNow: payable.hasCollectibleNow,
  }
}

// ---------------------------------------------------------------------------
// Payment acceptance (pure validation)
// ---------------------------------------------------------------------------

export type PaymentAcceptance =
  | { ok: true }
  | { ok: false; error: string }

export function validatePaymentAmount(input: {
  amount: number
  balanceDue: number
  maxPayableNow: number
  /** When targeting an installment */
  targetRemaining?: number | null
  allowPayAhead: boolean
  targetSuperseded?: boolean
  minCardAmount?: number | null
}): PaymentAcceptance {
  const amount = roundMoney(input.amount)
  if (amount <= 0) return { ok: false, error: 'Amount must be greater than zero' }
  if (amount > input.balanceDue + MONEY_EPS) {
    return { ok: false, error: 'Amount exceeds balance due' }
  }
  if (input.minCardAmount != null && amount < input.minCardAmount - MONEY_EPS) {
    return {
      ok: false,
      error: `Minimum card payment is $${input.minCardAmount.toFixed(2)}. Pay remaining balance under that amount with cash or check.`,
    }
  }
  if (amount > input.maxPayableNow + MONEY_EPS) {
    return { ok: false, error: 'Amount exceeds amount due now' }
  }
  if (input.targetSuperseded) {
    return { ok: false, error: 'Cannot target a superseded installment' }
  }
  if (
    input.targetRemaining != null &&
    !input.allowPayAhead &&
    amount > input.targetRemaining + MONEY_EPS
  ) {
    return { ok: false, error: 'Amount exceeds remaining on that installment' }
  }
  return { ok: true }
}

/** Shares map from expanded template for rebalance after expand. */
export function sharesFromExpanded(
  expanded: ExpandedInstallment[]
): Map<string, InstallmentShare> {
  return new Map(expanded.map((e) => [e.key, e.share]))
}

// ---------------------------------------------------------------------------
// Recurring all_future apply matrix (K8)
// ---------------------------------------------------------------------------

export type AllFutureDecision =
  | 'update'
  | 'skippedPast'
  | 'skippedPaid'
  | 'skippedOverride'
  | 'skipPrimary'

export type AllFutureCounts = {
  updated: number
  skippedPast: number
  skippedPaid: number
  skippedOverride: number
}

export function emptyAllFutureCounts(): AllFutureCounts {
  return { updated: 0, skippedPast: 0, skippedPaid: 0, skippedOverride: 0 }
}

/**
 * Authoritative skip matrix for applyMode=all_future siblings.
 * Primary is handled separately (already materialised); returns skipPrimary when isPrimary.
 */
export function classifyAllFutureInstance(input: {
  isPrimary: boolean
  status: string
  startTimeMs: number
  nowMs: number
  hasPayments: boolean
  planSource: string | null | undefined
  includeCustomized: boolean
}): AllFutureDecision {
  if (input.isPrimary) return 'skipPrimary'

  if (
    input.status === 'archived' ||
    input.status === 'cancelled' ||
    input.startTimeMs <= input.nowMs
  ) {
    return 'skippedPast'
  }

  if (input.hasPayments) return 'skippedPaid'

  if (input.planSource === 'job_override' && !input.includeCustomized) {
    return 'skippedOverride'
  }

  return 'update'
}

export function tallyAllFutureDecision(
  counts: AllFutureCounts,
  decision: AllFutureDecision
): AllFutureCounts {
  if (decision === 'skipPrimary') return counts
  if (decision === 'update') return { ...counts, updated: counts.updated + 1 }
  if (decision === 'skippedPast') {
    return { ...counts, skippedPast: counts.skippedPast + 1 }
  }
  if (decision === 'skippedPaid') {
    return { ...counts, skippedPaid: counts.skippedPaid + 1 }
  }
  return { ...counts, skippedOverride: counts.skippedOverride + 1 }
}

/** Staff toast copy for all_future results (design example). */
export function formatAllFutureApplyToast(counts: AllFutureCounts): string {
  const visitWord = counts.updated === 1 ? 'visit' : 'visits'
  const parts = [`Updated ${counts.updated} future ${visitWord}`]
  const skips: string[] = []
  if (counts.skippedPaid > 0) {
    skips.push(
      `${counts.skippedPaid} with payment${counts.skippedPaid === 1 ? '' : 's'}`
    )
  }
  if (counts.skippedOverride > 0) {
    skips.push(
      `${counts.skippedOverride} customized`
    )
  }
  if (counts.skippedPast > 0) {
    skips.push(`${counts.skippedPast} past`)
  }
  if (skips.length > 0) {
    parts.push(`skipped ${skips.join(', ')}`)
  }
  return `${parts.join('; ')}.`
}

// ---------------------------------------------------------------------------
// Invoice installment schedule (PR6)
// ---------------------------------------------------------------------------

export type InvoiceInstallmentRow = {
  label: string
  amountDue: number
  amountPaid: number
  remaining: number
  status: InstallmentStatus
  statusLabel: string
  dueDate: string | null
}

/** Non-default plans with active installments get a schedule section on the invoice PDF. */
export function shouldShowInvoiceInstallmentSchedule(
  plan: Pick<PlanProgressSummary, 'planType' | 'installments'> | null | undefined
): boolean {
  if (!plan) return false
  if (plan.planType === 'full_balance') return false
  return plan.installments.some((row) => row.status !== 'superseded')
}

export function formatInstallmentStatusLabel(status: InstallmentStatus): string {
  switch (status) {
    case 'paid':
      return 'Paid'
    case 'partial':
      return 'Partial'
    case 'superseded':
      return 'Superseded'
    case 'pending':
    default:
      return 'Due'
  }
}

/** Rows for invoice PDF — active installments only, in sequence order. */
export function toInvoiceInstallmentRows(
  plan: Pick<PlanProgressSummary, 'installments'> | null | undefined
): InvoiceInstallmentRow[] {
  if (!plan) return []
  return plan.installments
    .filter((row) => row.status !== 'superseded')
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((row) => ({
      label: row.label,
      amountDue: row.amountDue,
      amountPaid: row.amountPaid,
      remaining: row.remaining,
      status: row.status,
      statusLabel: formatInstallmentStatusLabel(row.status),
      dueDate: row.dueDate,
    }))
}
