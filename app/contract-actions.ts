'use server'

import { createClient } from '@supabase/supabase-js'
import {
  createContractForSchedule,
  getActiveContractForSchedule,
  sendContractToClient,
  voidContract,
} from '@/lib/contracts-server'
import {
  formatContractNumber,
  formatContractStatus,
  type ContractRecord,
} from '@/lib/contracts'
import {
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyStaffForContracts() {
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
  }
}

async function verifyScheduleContractAccess(scheduleId: string, clientId: string) {
  const check = await verifyStaffForContracts()
  if (!check.ok) return check

  const supabaseAdmin = createSupabaseAdmin()
  const { data: client, error: clientError } = await supabaseAdmin
    .from('clients')
    .select('company_id')
    .eq('id', clientId)
    .single()

  if (clientError || !client?.company_id || client.company_id !== check.companyId) {
    return { ok: false as const, error: 'Job not found' }
  }

  const { data: schedule, error } = await supabaseAdmin
    .from('schedules')
    .select('id, client_id')
    .eq('id', scheduleId)
    .eq('client_id', clientId)
    .single()

  if (error || !schedule) {
    return { ok: false as const, error: 'Job not found' }
  }

  return { ok: true as const, companyId: check.companyId }
}

async function verifyContractAccess(contractId: string, scheduleId: string, clientId: string) {
  const scheduleCheck = await verifyScheduleContractAccess(scheduleId, clientId)
  if (!scheduleCheck.ok) return scheduleCheck

  const supabaseAdmin = createSupabaseAdmin()
  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('id, company_id, schedule_id, client_id')
    .eq('id', contractId)
    .single()

  if (error || !contract) {
    return { ok: false as const, error: 'Contract not found' }
  }
  if (
    contract.company_id !== scheduleCheck.companyId ||
    contract.schedule_id !== scheduleId ||
    contract.client_id !== clientId
  ) {
    return { ok: false as const, error: 'Unauthorized' }
  }

  return { ok: true as const, companyId: scheduleCheck.companyId }
}

export type JobContractSummary = {
  id: string
  number: string
  title: string
  status: ContractRecord['status']
  statusLabel: string
  sentAt: string | null
  signedAt: string | null
  createdAt: string
}

function toJobContractSummary(contract: ContractRecord): JobContractSummary {
  return {
    id: contract.id,
    number: formatContractNumber(contract.id, contract.created_at),
    title: contract.title,
    status: contract.status,
    statusLabel: formatContractStatus(contract.status),
    sentAt: contract.sent_at,
    signedAt: contract.client_signed_at,
    createdAt: contract.created_at,
  }
}

export async function getJobContractAction(
  scheduleId: string,
  clientId: string
): Promise<
  | { success: true; contract: JobContractSummary | null }
  | { success: false; error: string }
> {
  const access = await verifyScheduleContractAccess(scheduleId, clientId)
  if (!access.ok) return { success: false, error: access.error }

  try {
    const contract = await getActiveContractForSchedule(scheduleId)
    return {
      success: true,
      contract: contract ? toJobContractSummary(contract) : null,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load contract'
    if (message.includes('42P01')) {
      return { success: true, contract: null }
    }
    return { success: false, error: message }
  }
}

export async function createJobContractAction(
  scheduleId: string,
  clientId: string
): Promise<
  | { success: true; contract: JobContractSummary }
  | { success: false; error: string }
> {
  const access = await verifyScheduleContractAccess(scheduleId, clientId)
  if (!access.ok) return { success: false, error: access.error }

  try {
    const contract = await createContractForSchedule(scheduleId)
    return { success: true, contract: toJobContractSummary(contract) }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create contract'
    return { success: false, error: message }
  }
}

export async function sendJobContractAction(
  contractId: string,
  scheduleId: string,
  clientId: string
): Promise<
  | { success: true; contract: JobContractSummary }
  | { success: false; error: string }
> {
  const access = await verifyContractAccess(contractId, scheduleId, clientId)
  if (!access.ok) return { success: false, error: access.error }

  try {
    const contract = await sendContractToClient(contractId)
    return { success: true, contract: toJobContractSummary(contract) }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send contract'
    return { success: false, error: message }
  }
}

export async function voidJobContractAction(
  contractId: string,
  scheduleId: string,
  clientId: string
): Promise<
  | { success: true; contract: JobContractSummary }
  | { success: false; error: string }
> {
  const access = await verifyContractAccess(contractId, scheduleId, clientId)
  if (!access.ok) return { success: false, error: access.error }

  try {
    const contract = await voidContract(contractId)
    return { success: true, contract: toJobContractSummary(contract) }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to void contract'
    return { success: false, error: message }
  }
}