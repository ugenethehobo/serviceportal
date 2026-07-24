'use server'

import { signContractByClient } from '@/lib/contracts-server'
import {
  extractContractSigningRequirements,
  type ContractSigningRequirements,
} from '@/lib/contract-signing'
import {
  loadContractTemplateById,
  resolveContractTemplateForSchedule,
} from '@/lib/contract-templates-server'
import {
  formatContractNumber,
  formatContractStatus,
  isSignableContractStatus,
  type ContractRecord,
  type ContractStatus,
} from '@/lib/contracts'
import { normalizeDocumentTemplate } from '@/lib/document-template'
import { createSupabaseAdmin, resolvePortalSession } from '@/lib/portal-auth'

async function requirePortalClient() {
  const portal = await resolvePortalSession()
  if (!portal) {
    throw new Error('Unauthorized')
  }

  if (!portal.isPreview && !portal.portalEnabled) {
    throw new Error('Portal access disabled')
  }

  return {
    clientId: portal.clientId,
    clientName: portal.clientName,
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

export type PortalContractSigningData = {
  contract: {
    id: string
    number: string
    title: string
    status: ContractStatus
    statusLabel: string
    signedAt: string | null
    signedName: string | null
  }
  companyName: string
  clientName: string
  documentId: string | null
  requirements: ContractSigningRequirements
  canSign: boolean
  fieldValues: Record<string, string>
}

async function loadContractSigningRequirements(
  admin: ReturnType<typeof createSupabaseAdmin>,
  contract: ContractRecord & { schedule?: { title?: string } | { title?: string }[] | null }
): Promise<ContractSigningRequirements> {
  const schedule = Array.isArray(contract.schedule)
    ? contract.schedule[0]
    : contract.schedule

  let template = null
  if (contract.contract_template_id) {
    const record = await loadContractTemplateById(
      admin,
      contract.company_id,
      contract.contract_template_id
    )
    template = record?.template ?? null
  }

  if (!template) {
    const resolved = await resolveContractTemplateForSchedule(
      admin,
      contract.company_id,
      schedule?.title || contract.title
    )
    template = resolved.template
  }

  return extractContractSigningRequirements(normalizeDocumentTemplate(template, 'contract'))
}

export async function getPortalContractSigningPageAction(contractId: string): Promise<
  | { success: true; data: PortalContractSigningData }
  | { success: false; error: string }
> {
  try {
    const portal = await requirePortalClient()
    const admin = createSupabaseAdmin()

    const { data: contract, error } = await admin
      .from('contracts')
      .select(`
        *,
        schedule:schedules!schedule_id (title),
        company:companies!company_id (name)
      `)
      .eq('id', contractId)
      .eq('client_id', portal.clientId)
      .single()

    if (error || !contract) {
      return { success: false, error: 'Contract not found' }
    }

    const company = Array.isArray((contract as { company?: { name?: string }[] | { name?: string } }).company)
      ? (contract as { company: { name?: string }[] }).company[0]
      : (contract as { company?: { name?: string } }).company

    const { data: document } = await admin
      .from('client_documents')
      .select('id')
      .eq('contract_id', contractId)
      .eq('source', 'contract')
      .maybeSingle()

    const requirements = await loadContractSigningRequirements(
      admin,
      contract as ContractRecord & { schedule?: { title?: string } | { title?: string }[] | null }
    )

    const fieldValues =
      contract.field_values && typeof contract.field_values === 'object'
        ? (contract.field_values as Record<string, string>)
        : {}

    const status = contract.status as ContractStatus

    return {
      success: true,
      data: {
        contract: {
          id: contract.id,
          number: formatContractNumber(contract.id, contract.created_at),
          title: contract.title,
          status,
          statusLabel: formatContractStatus(status),
          signedAt: contract.client_signed_at,
          signedName: contract.client_signed_name,
        },
        companyName: company?.name || 'Your service company',
        clientName: portal.clientName,
        documentId: document?.id ?? null,
        requirements,
        canSign: isSignableContractStatus(status),
        fieldValues,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load contract'
    if (message.includes('42P01')) {
      return { success: false, error: 'Contracts are not enabled yet' }
    }
    return { success: false, error: message }
  }
}

export async function signPortalContractAction(
  contractId: string,
  input: {
    signedName: string
    fieldValues: Record<string, string>
    signatureDataUrl?: string | null
    initialsDataUrl?: string | null
  }
): Promise<
  | { success: true; contract: PortalContractSigningData['contract'] }
  | { success: false; error: string }
> {
  try {
    const portal = await requirePortalClientWrite()
    const contract = await signContractByClient(contractId, portal.clientId, input)

    return {
      success: true,
      contract: {
        id: contract.id,
        number: formatContractNumber(contract.id, contract.created_at),
        title: contract.title,
        status: contract.status,
        statusLabel: formatContractStatus(contract.status),
        signedAt: contract.client_signed_at,
        signedName: contract.client_signed_name,
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sign contract'
    return { success: false, error: message }
  }
}