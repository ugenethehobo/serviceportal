'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { ContractPdfError } from '@/lib/contract-pdf-source'
import { listContractTemplateOptions, resolveContractTemplateForSchedule } from '@/lib/contract-templates-server'
import type { ContractTemplateOption } from '@/lib/contract-templates'
import {
  createContract,
  deleteContract,
  duplicateContract,
  getContractEditorData,
  getContractSummary,
  listContracts,
  recallContract,
  remindContractSigner,
  sendContractToClient,
  syncContractDocument,
  updateContractDraft,
  voidContract,
  type ContractEditorData,
} from '@/lib/contracts-server'
import type { ContractSummary } from '@/lib/contracts'
import type { DocumentTemplate } from '@/lib/document-template'
import {
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string }

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyStaffForContracts() {
  const session = await getSessionProfile()
  if (!session) return { ok: false as const, error: 'Not authenticated' }
  if (!session.profile.company_id) {
    return { ok: false as const, error: 'No company associated with this account' }
  }
  if (!isStaffRole(session.profile.role)) return { ok: false as const, error: 'Unauthorized' }

  const subscription = await verifyStaffSubscriptionAccess(session.profile.company_id)
  if (!subscription.ok) return { ok: false as const, error: TRIAL_EXPIRED_ERROR }

  return {
    ok: true as const,
    companyId: session.profile.company_id,
    userId: session.userId,
    senderName: session.profile.full_name?.trim() || session.profile.email?.trim() || null,
  }
}

async function verifyClientAccess(clientId: string, scheduleId?: string | null) {
  const check = await verifyStaffForContracts()
  if (!check.ok) return check

  const supabaseAdmin = createSupabaseAdmin()
  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('company_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!client || client.company_id !== check.companyId) {
    return { ok: false as const, error: 'Client not found' }
  }

  if (scheduleId) {
    const { data: schedule } = await supabaseAdmin
      .from('schedules')
      .select('id')
      .eq('id', scheduleId)
      .eq('client_id', clientId)
      .maybeSingle()
    if (!schedule) return { ok: false as const, error: 'Job not found' }
  }

  return check
}

function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback
  if (message.includes('42P01')) return 'Contracts are not enabled yet. Run supabase/contracts-schema.sql.'
  return message || fallback
}

function revalidateContractPaths(summary: Pick<ContractSummary, 'scheduleId'>, clientId: string) {
  revalidatePath(`/dashboard/clients/${clientId}`)
  if (summary.scheduleId) revalidatePath(`/dashboard/clients/${clientId}/jobs/${summary.scheduleId}`)
}

/** Runs a mutation on a contract the caller's company owns, then returns its fresh summary. */
async function withContract(
  contractId: string,
  fallbackError: string,
  run: (context: { companyId: string; userId: string; senderName: string | null }) => Promise<void>
): Promise<ActionResult<{ contract: ContractSummary }>> {
  const check = await verifyStaffForContracts()
  if (!check.ok) return { success: false, error: check.error }

  try {
    const before = await getContractSummary(contractId, check.companyId)
    await run(check)
    const contract = await getContractSummary(contractId, check.companyId).catch(() => before)
    return { success: true, contract }
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, fallbackError) }
  }
}

export async function listContractsAction(
  clientId: string,
  scheduleId?: string | null
): Promise<ActionResult<{ contracts: ContractSummary[] }>> {
  const access = await verifyClientAccess(clientId, scheduleId)
  if (!access.ok) return { success: false, error: access.error }

  try {
    const contracts = await listContracts({ companyId: access.companyId, clientId, scheduleId })
    return { success: true, contracts }
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Failed to load contracts') }
  }
}

export async function getContractCreationOptionsAction(
  clientId: string,
  scheduleId?: string | null
): Promise<
  ActionResult<{
    templates: ContractTemplateOption[]
    suggestedTemplateId: string | null
    jobs: Array<{ id: string; title: string; start_time: string | null }>
  }>
> {
  const access = await verifyClientAccess(clientId, scheduleId)
  if (!access.ok) return { success: false, error: access.error }

  try {
    const supabaseAdmin = createSupabaseAdmin()
    const [templates, jobsResult, schedule] = await Promise.all([
      listContractTemplateOptions(supabaseAdmin, access.companyId),
      supabaseAdmin
        .from('schedules')
        .select('id, title, start_time')
        .eq('client_id', clientId)
        .order('start_time', { ascending: false })
        .limit(50),
      scheduleId
        ? supabaseAdmin.from('schedules').select('title').eq('id', scheduleId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const suggested = await resolveContractTemplateForSchedule(
      supabaseAdmin,
      access.companyId,
      (schedule.data as { title?: string } | null)?.title ?? null
    )

    return {
      success: true,
      templates,
      suggestedTemplateId: suggested.id,
      jobs: (jobsResult.data || []) as Array<{ id: string; title: string; start_time: string | null }>,
    }
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Failed to load contract templates') }
  }
}

/**
 * FormData fields: clientId, scheduleId?, templateId?, title?, file? (one-off PDF).
 */
export async function createContractAction(
  formData: FormData
): Promise<ActionResult<{ contract: ContractSummary }>> {
  const clientId = String(formData.get('clientId') || '')
  const scheduleId = String(formData.get('scheduleId') || '') || null
  const templateId = String(formData.get('templateId') || '') || null
  const title = String(formData.get('title') || '') || null
  const file = formData.get('file')

  if (!clientId) return { success: false, error: 'Client is required' }
  const access = await verifyClientAccess(clientId, scheduleId)
  if (!access.ok) return { success: false, error: access.error }

  try {
    let uploadedPdf: { bytes: Uint8Array; fileName: string } | null = null
    if (file && typeof file === 'object' && 'arrayBuffer' in file && (file as File).size > 0) {
      const pdf = file as File
      if (pdf.type && pdf.type !== 'application/pdf') {
        return { success: false, error: 'Upload a PDF file' }
      }
      uploadedPdf = { bytes: new Uint8Array(await pdf.arrayBuffer()), fileName: pdf.name || 'contract.pdf' }
    }

    const created = await createContract({
      companyId: access.companyId,
      clientId,
      scheduleId,
      templateId: uploadedPdf ? null : templateId,
      title,
      uploadedPdf,
    })
    const contract = await getContractSummary(created.id, access.companyId)
    revalidateContractPaths(contract, clientId)
    return { success: true, contract }
  } catch (error: unknown) {
    if (error instanceof ContractPdfError) return { success: false, error: error.message }
    return { success: false, error: errorMessage(error, 'Failed to create contract') }
  }
}

export async function getContractEditorAction(
  contractId: string
): Promise<ActionResult<{ data: ContractEditorData }>> {
  const check = await verifyStaffForContracts()
  if (!check.ok) return { success: false, error: check.error }

  try {
    return { success: true, data: await getContractEditorData(contractId, check.companyId) }
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Failed to load contract') }
  }
}

export async function updateContractDraftAction(
  contractId: string,
  patch: { title?: string; template?: DocumentTemplate; fieldValues?: Record<string, string> }
): Promise<ActionResult> {
  const check = await verifyStaffForContracts()
  if (!check.ok) return { success: false, error: check.error }

  try {
    await updateContractDraft(contractId, check.companyId, patch)
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Failed to save contract') }
  }
}

/** Re-renders the stored PDF after editing so the documents folder shows the latest draft. */
export async function finalizeContractDraftAction(
  contractId: string
): Promise<ActionResult<{ contract: ContractSummary }>> {
  return withContract(contractId, 'Failed to update the contract PDF', async () => {
    await syncContractDocument(contractId)
  })
}

export async function sendContractAction(
  contractId: string,
  options: { notifyClient?: boolean; postToMessages?: boolean } = {}
): Promise<ActionResult<{ contract: ContractSummary; messagePosted: boolean }>> {
  let messagePosted = false
  const result = await withContract(contractId, 'Failed to send contract', async (ctx) => {
    const outcome = await sendContractToClient(contractId, ctx.companyId, {
      notifyClient: options.notifyClient !== false,
      postToMessages: options.postToMessages ? { userId: ctx.userId, name: ctx.senderName } : null,
    })
    messagePosted = outcome.messagePosted
  })
  return result.success ? { ...result, messagePosted } : result
}

export async function remindContractAction(contractId: string) {
  return withContract(contractId, 'Failed to send reminder', async (ctx) => {
    await remindContractSigner(contractId, ctx.companyId)
  })
}

export async function recallContractAction(contractId: string) {
  return withContract(contractId, 'Failed to recall contract', async (ctx) => {
    await recallContract(contractId, ctx.companyId)
  })
}

export async function voidContractAction(contractId: string) {
  return withContract(contractId, 'Failed to void contract', async (ctx) => {
    await voidContract(contractId, ctx.companyId)
  })
}

export async function duplicateContractAction(
  contractId: string
): Promise<ActionResult<{ contract: ContractSummary }>> {
  const check = await verifyStaffForContracts()
  if (!check.ok) return { success: false, error: check.error }

  try {
    const created = await duplicateContract(contractId, check.companyId)
    const contract = await getContractSummary(created.id, check.companyId)
    revalidateContractPaths(contract, created.client_id)
    return { success: true, contract }
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Failed to duplicate contract') }
  }
}

export async function deleteContractAction(contractId: string): Promise<ActionResult> {
  const check = await verifyStaffForContracts()
  if (!check.ok) return { success: false, error: check.error }

  try {
    await deleteContract(contractId, check.companyId)
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Failed to delete contract') }
  }
}
