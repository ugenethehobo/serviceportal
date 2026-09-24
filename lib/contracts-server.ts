import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getDisplayAddressFromClient } from '@/lib/address'
import { getAppBaseUrl } from '@/lib/app-url'
import { generateContractPdf } from '@/lib/contract-pdf'
import { prepareContractPdf } from '@/lib/contract-pdf-source'
import {
  extractContractSigningRequirements,
  extractContractStaffFields,
  mergeClientSigningValues,
  parseSignatureDataUrl,
  sanitizeStaffFieldValues,
  validateContractSigningSubmission,
  validateContractStaffFields,
  type ContractStaffField,
} from '@/lib/contract-signing'
import { buildPdfContractTemplate, type ContractTemplateRecord } from '@/lib/contract-templates'
import {
  CONTRACT_STORAGE_BUCKET,
  CONTRACTS_V2_MIGRATION_MESSAGE,
  copyContractStorageObject,
  ensureDefaultContractTemplate,
  isCompanyStoragePath,
  isMissingColumnError,
  loadContractStorageBytes,
  loadContractTemplateById,
  resolveContractTemplateForSchedule,
  uploadContractPdf,
} from '@/lib/contract-templates-server'
import {
  canSendContractReminder,
  formatContractNumber,
  formatContractStatus,
  isDeletableContractStatus,
  isEditableContractStatus,
  isRecallableContractStatus,
  type ContractRecord,
  type ContractSummary,
} from '@/lib/contracts'
import { normalizeDocumentTemplate, type DocumentTemplate } from '@/lib/document-template'
import { SYSTEM_DOCUMENT_CATEGORY_CONTRACTS } from '@/lib/document-categories'
import {
  notifyClientContractSent,
  notifyStaffContractSigned,
  queueNotification,
} from '@/lib/notifications-server'

export class ContractError extends Error {}

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function formatLongDate(iso: string | null | undefined) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function contractFolder(contract: Pick<ContractRecord, 'company_id' | 'client_id' | 'id'>) {
  return `${contract.company_id}/${contract.client_id}/contracts/${contract.id}`
}

function contractSourcePdfPath(contract: Pick<ContractRecord, 'company_id' | 'client_id' | 'id'>) {
  return `${contractFolder(contract)}/source.pdf`
}

function readFieldValues(contract: { field_values?: unknown }): Record<string, string> {
  const raw = contract.field_values
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')])
  )
}

async function loadContractRow(
  supabaseAdmin: SupabaseClient,
  contractId: string,
  companyId?: string
): Promise<ContractRecord> {
  let query = supabaseAdmin.from('contracts').select('*').eq('id', contractId)
  if (companyId) query = query.eq('company_id', companyId)
  const { data, error } = await query.maybeSingle()
  if (error && error.code !== '22P02') throw error
  if (!data) throw new ContractError('Contract not found')
  return data as ContractRecord
}

/**
 * The layout a contract renders with. v2 contracts carry a frozen snapshot so template
 * edits never change a contract that was already sent; v1 contracts fall back to their
 * template, then to the schedule's resolved template.
 */
export async function resolveContractLayout(
  supabaseAdmin: SupabaseClient,
  contract: ContractRecord,
  scheduleTitle?: string | null
): Promise<DocumentTemplate> {
  if (contract.template_snapshot && typeof contract.template_snapshot === 'object') {
    return normalizeDocumentTemplate(contract.template_snapshot, 'contract')
  }

  if (contract.contract_template_id) {
    const record = await loadContractTemplateById(
      supabaseAdmin,
      contract.company_id,
      contract.contract_template_id
    )
    if (record) return record.template
  }

  const resolved = await resolveContractTemplateForSchedule(
    supabaseAdmin,
    contract.company_id,
    scheduleTitle || contract.title
  )
  return resolved.template
}

async function findContractDocument(supabaseAdmin: SupabaseClient, contractId: string) {
  const { data } = await supabaseAdmin
    .from('client_documents')
    .select('id, storage_path, source')
    .eq('contract_id', contractId)
    .maybeSingle()
  return data as { id: string; storage_path: string; source: string } | null
}

async function upsertContractDocumentRow(
  supabaseAdmin: SupabaseClient,
  input: {
    contractId: string
    scheduleId: string | null
    clientId: string
    companyId: string
    fileName: string
    storagePath: string
    existingDoc: { id: string } | null
  }
) {
  const row = {
    name: input.fileName,
    storage_path: input.storagePath,
    file_type: 'application/pdf',
    category: SYSTEM_DOCUMENT_CATEGORY_CONTRACTS,
    schedule_id: input.scheduleId,
    contract_id: input.contractId,
  }

  if (input.existingDoc) {
    const { error } = await supabaseAdmin
      .from('client_documents')
      .update(row)
      .eq('id', input.existingDoc.id)
    if (error) throw error
    return { documentId: input.existingDoc.id, fileName: input.fileName, storagePath: input.storagePath }
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('client_documents')
    .insert({ client_id: input.clientId, company_id: input.companyId, ...row, source: 'contract' })
    .select('id')
    .single()

  if (!insertError && inserted) {
    return { documentId: inserted.id, fileName: input.fileName, storagePath: input.storagePath }
  }

  if (insertError?.code !== '23514') {
    throw new Error(
      insertError?.message ||
        'Could not save contract document. Run supabase/contracts-schema.sql in Supabase.'
    )
  }

  const { data: fallbackInserted, error: fallbackError } = await supabaseAdmin
    .from('client_documents')
    .insert({ client_id: input.clientId, company_id: input.companyId, ...row, source: 'upload' })
    .select('id')
    .single()

  if (fallbackError) {
    throw new Error(
      fallbackError.message ||
        'Could not save contract document. Run supabase/contracts-schema.sql in Supabase.'
    )
  }

  return { documentId: fallbackInserted.id, fileName: input.fileName, storagePath: input.storagePath }
}

type ContractRenderContext = {
  contract: ContractRecord
  schedule: { id: string; title: string | null; start_time: string | null } | null
  client: Record<string, unknown> | null
  company: { name?: string | null; address?: string | null; phone?: string | null } | null
}

async function loadContractRenderContext(
  supabaseAdmin: SupabaseClient,
  contractId: string,
  companyId?: string
): Promise<ContractRenderContext> {
  let query = supabaseAdmin
    .from('contracts')
    .select(`
      *,
      schedule:schedules!schedule_id (id, title, start_time),
      client:clients!client_id (
        name,
        contact_name,
        email,
        phone,
        address,
        address_street,
        address_unit,
        address_city,
        address_state,
        address_zip
      ),
      company:companies!company_id (name, address, phone)
    `)
    .eq('id', contractId)
  if (companyId) query = query.eq('company_id', companyId)

  const { data, error } = await query.maybeSingle()
  if (error && error.code !== '22P02') throw error
  if (!data) throw new ContractError('Contract not found')

  const row = data as ContractRecord & {
    schedule?: unknown
    client?: unknown
    company?: unknown
  }
  return {
    contract: row,
    schedule: one(row.schedule as ContractRenderContext['schedule']),
    client: one<Record<string, unknown>>(row.client as Record<string, unknown> | null),
    company: one(row.company as ContractRenderContext['company']),
  }
}

async function buildContractPdf(
  supabaseAdmin: SupabaseClient,
  context: ContractRenderContext,
  options: {
    layout?: DocumentTemplate
    fieldValues?: Record<string, string>
    preview?: boolean
  } = {}
): Promise<Uint8Array> {
  const { contract, schedule, client, company } = context
  const layout =
    options.layout ?? (await resolveContractLayout(supabaseAdmin, contract, schedule?.title))

  const backgroundPath = layout.background?.storagePath
  let basePdfBytes: Uint8Array | null = null
  if (backgroundPath) {
    if (!isCompanyStoragePath(contract.company_id, backgroundPath)) {
      throw new ContractError('Contract PDF is not available')
    }
    basePdfBytes = await loadContractStorageBytes(supabaseAdmin, backgroundPath)
    if (!basePdfBytes) throw new ContractError('The contract PDF could not be loaded')
  }

  const { loadCompanyLogoBytesForPdf } = await import('@/lib/document-template-logo-server')
  const [logoBytes, clientSignature, clientInitials] = await Promise.all([
    loadCompanyLogoBytesForPdf(contract.company_id),
    loadContractStorageBytes(supabaseAdmin, contract.client_signature_storage_path),
    loadContractStorageBytes(supabaseAdmin, contract.client_initials_storage_path),
  ])

  const contractNumber = formatContractNumber(contract.id, contract.created_at)
  const isSigned = contract.status === 'signed' && !!contract.client_signed_at
  const clientName = (client?.name as string | undefined) || 'Client'

  return generateContractPdf({
    contract: {
      number: contractNumber,
      issuedAt: contract.created_at,
      title: contract.title,
      serviceName: schedule?.title || null,
      signedDate: isSigned ? formatLongDate(contract.client_signed_at) : null,
      signedName: isSigned ? contract.client_signed_name : null,
      jobTitle: schedule?.title || contract.title,
      visitDate: formatLongDate(schedule?.start_time),
    },
    company: {
      name: company?.name || 'Company',
      address: company?.address || null,
      phone: company?.phone || null,
      logoBytes,
    },
    client: {
      name: clientName,
      contact_name: (client?.contact_name as string | null) ?? null,
      email: (client?.email as string | null) ?? null,
      phone: (client?.phone as string | null) ?? null,
      address: client
        ? getDisplayAddressFromClient(client as Parameters<typeof getDisplayAddressFromClient>[0])
        : null,
    },
    template: layout,
    basePdfBytes,
    showStaffPlaceholders: options.preview === true,
    fieldValues: options.fieldValues ?? readFieldValues(contract),
    signatures: { client: clientSignature, clientInitials },
    auditTrail:
      isSigned && !options.preview
        ? {
            title: 'Signature certificate',
            rows: [
              { label: 'Document', value: contract.title },
              { label: 'Contract number', value: contractNumber },
              { label: 'Issued by', value: company?.name || 'Company' },
              { label: 'Signer', value: contract.client_signed_name || clientName },
              { label: 'Signer email', value: (client?.email as string | null) || '—' },
              { label: 'Sent for signature', value: contract.sent_at ? new Date(contract.sent_at).toUTCString() : '—' },
              { label: 'Signed', value: new Date(contract.client_signed_at!).toUTCString() },
              { label: 'Signer IP address', value: contract.client_signed_ip || '—' },
              { label: 'Signer device', value: contract.client_signed_user_agent || '—' },
              {
                label: 'Method',
                value: 'Signed electronically in the client portal after signing in to the client account.',
              },
              { label: 'Contract ID', value: contract.id },
            ],
          }
        : null,
  })
}

/** Re-renders the stored PDF and keeps the Contracts folder document in sync. */
export async function syncContractDocument(contractId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const context = await loadContractRenderContext(supabaseAdmin, contractId)
  const { contract } = context
  const pdfBytes = await buildContractPdf(supabaseAdmin, context)

  const contractNumber = formatContractNumber(contract.id, contract.created_at)
  const storagePath = `${contract.company_id}/${contract.client_id}/contracts/${contract.id}.pdf`
  const fileName = `${contractNumber}.pdf`

  await uploadContractPdf(supabaseAdmin, storagePath, pdfBytes)

  await supabaseAdmin
    .from('contracts')
    .update({ storage_path: storagePath, updated_at: new Date().toISOString() })
    .eq('id', contractId)

  return upsertContractDocumentRow(supabaseAdmin, {
    contractId,
    scheduleId: contract.schedule_id,
    clientId: contract.client_id,
    companyId: contract.company_id,
    fileName,
    storagePath,
    existingDoc: await findContractDocument(supabaseAdmin, contractId),
  })
}

/** Live preview of a contract (optionally with unsaved editor changes) using real data. */
export async function renderContractPreview(
  companyId: string,
  contractId: string,
  override?: { template?: unknown; fieldValues?: Record<string, string> }
): Promise<Uint8Array> {
  const supabaseAdmin = createSupabaseAdmin()
  const context = await loadContractRenderContext(supabaseAdmin, contractId, companyId)
  const stored = await resolveContractLayout(supabaseAdmin, context.contract, context.schedule?.title)

  let layout = stored
  if (override?.template !== undefined) {
    const incoming = normalizeDocumentTemplate(override.template, 'contract')
    layout = lockBackground(incoming, stored)
  }

  const fieldValues = override?.fieldValues
    ? sanitizeStaffFieldValues(
        extractContractStaffFields(layout),
        readFieldValues(context.contract),
        override.fieldValues
      )
    : readFieldValues(context.contract)

  return buildContractPdf(supabaseAdmin, context, { layout, fieldValues, preview: true })
}

/** The PDF background and its page sizes can only come from the server. */
function lockBackground(incoming: DocumentTemplate, stored: DocumentTemplate): DocumentTemplate {
  return normalizeDocumentTemplate(
    {
      ...incoming,
      background: stored.background,
      pages: stored.background ? stored.pages : incoming.pages,
    },
    'contract'
  )
}

type ContractListRow = ContractRecord & {
  schedule?: { title?: string | null } | { title?: string | null }[] | null
  documents?: { id: string }[] | { id: string } | null
}

function toContractSummary(row: ContractListRow): ContractSummary {
  const schedule = one(row.schedule)
  const document = one(row.documents)
  const snapshot =
    row.template_snapshot && typeof row.template_snapshot === 'object'
      ? (row.template_snapshot as { background?: unknown })
      : null
  return {
    id: row.id,
    number: formatContractNumber(row.id, row.created_at),
    title: row.title,
    status: row.status,
    statusLabel: formatContractStatus(row.status),
    scheduleId: row.schedule_id,
    jobTitle: schedule?.title ?? null,
    sentAt: row.sent_at,
    signedAt: row.client_signed_at,
    signedName: row.client_signed_name,
    createdAt: row.created_at,
    reminderSentAt: row.reminder_sent_at ?? null,
    documentId: document?.id ?? null,
    isPdfBased: !!snapshot?.background,
  }
}

export async function listContracts(input: {
  companyId: string
  clientId: string
  scheduleId?: string | null
}): Promise<ContractSummary[]> {
  const supabaseAdmin = createSupabaseAdmin()
  let query = supabaseAdmin
    .from('contracts')
    .select(`
      *,
      schedule:schedules!schedule_id (title),
      documents:client_documents!contract_id (id)
    `)
    .eq('company_id', input.companyId)
    .eq('client_id', input.clientId)
    .order('created_at', { ascending: false })

  if (input.scheduleId) query = query.eq('schedule_id', input.scheduleId)

  const { data, error } = await query
  if (error) {
    if (error.code === '42P01') return []
    throw error
  }
  return ((data || []) as ContractListRow[]).map(toContractSummary)
}

export async function getContractSummary(
  contractId: string,
  companyId: string
): Promise<ContractSummary> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('contracts')
    .select(`
      *,
      schedule:schedules!schedule_id (title),
      documents:client_documents!contract_id (id)
    `)
    .eq('id', contractId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new ContractError('Contract not found')
  return toContractSummary(data as ContractListRow)
}

async function insertContractRow(
  supabaseAdmin: SupabaseClient,
  row: Record<string, unknown>,
  requiresSnapshot: boolean
): Promise<ContractRecord> {
  const result = await supabaseAdmin.from('contracts').insert(row).select('*').single()
  if (!result.error) return result.data as ContractRecord

  if (isMissingColumnError(result.error)) {
    if (requiresSnapshot) throw new ContractError(CONTRACTS_V2_MIGRATION_MESSAGE)
    // Before the v2 migration contracts reference their template instead of a snapshot.
    const legacyRow = { ...row }
    delete legacyRow.template_snapshot
    const legacy = await supabaseAdmin.from('contracts').insert(legacyRow).select('*').single()
    if (!legacy.error) return legacy.data as ContractRecord
    throw new Error(legacy.error.message)
  }

  throw new Error(
    result.error.message || 'Could not create contract. Run supabase/contracts-schema.sql in Supabase.'
  )
}

async function updateSnapshot(
  supabaseAdmin: SupabaseClient,
  contractId: string,
  snapshot: DocumentTemplate
) {
  const { error } = await supabaseAdmin
    .from('contracts')
    .update({ template_snapshot: snapshot, updated_at: new Date().toISOString() })
    .eq('id', contractId)
  if (error) {
    if (isMissingColumnError(error)) throw new ContractError(CONTRACTS_V2_MIGRATION_MESSAGE)
    throw error
  }
}

function dispatchContractZapier(
  supabaseAdmin: SupabaseClient,
  event: 'contract_created' | 'contract_voided',
  contract: ContractRecord,
  extra: Record<string, unknown>
) {
  void import('@/lib/integration-events').then(({ queueCompanyZapierEvent }) =>
    queueCompanyZapierEvent(supabaseAdmin, {
      companyId: contract.company_id,
      event,
      data: {
        contract_id: contract.id,
        contract_number: formatContractNumber(contract.id, contract.created_at),
        client_id: contract.client_id,
        schedule_id: contract.schedule_id,
        contract_title: contract.title,
        ...extra,
      },
    })
  )
}

export type CreateContractInput = {
  companyId: string
  clientId: string
  scheduleId: string | null
  templateId?: string | null
  title?: string | null
  uploadedPdf?: { bytes: Uint8Array; fileName: string } | null
}

/**
 * Creates a draft contract from a library template or a one-off uploaded PDF. The layout
 * is copied onto the contract (and its PDF copied into the contract's folder) so staff can
 * tailor this contract without touching the template.
 */
export async function createContract(input: CreateContractInput): Promise<ContractRecord> {
  const supabaseAdmin = createSupabaseAdmin()

  let scheduleTitle: string | null = null
  if (input.scheduleId) {
    const { data: schedule } = await supabaseAdmin
      .from('schedules')
      .select('id, title, client_id')
      .eq('id', input.scheduleId)
      .maybeSingle()
    if (!schedule || schedule.client_id !== input.clientId) throw new ContractError('Job not found')
    scheduleTitle = schedule.title?.trim() || null
  }

  let template: ContractTemplateRecord | null = null
  let layout: DocumentTemplate
  let preparedPdf: Awaited<ReturnType<typeof prepareContractPdf>> | null = null
  let baseTitle: string

  if (input.uploadedPdf) {
    preparedPdf = await prepareContractPdf(input.uploadedPdf.bytes)
    layout = buildPdfContractTemplate({
      storagePath: `${input.companyId}/pending.pdf`,
      fileName: input.uploadedPdf.fileName,
      pageSizes: preparedPdf.pageSizes,
    })
    baseTitle = input.uploadedPdf.fileName.replace(/\.pdf$/i, '').trim() || 'Contract'
  } else {
    if (input.templateId) {
      template = await loadContractTemplateById(supabaseAdmin, input.companyId, input.templateId)
      if (!template) throw new ContractError('Contract template not found')
    } else if (scheduleTitle) {
      template = await resolveContractTemplateForSchedule(supabaseAdmin, input.companyId, scheduleTitle)
    } else {
      template = await ensureDefaultContractTemplate(supabaseAdmin, input.companyId)
    }
    layout = template.template
    baseTitle = template.name
  }

  const title =
    input.title?.trim().slice(0, 160) ||
    (scheduleTitle ? `${baseTitle} — ${scheduleTitle}` : baseTitle)

  const created = await insertContractRow(
    supabaseAdmin,
    {
      company_id: input.companyId,
      client_id: input.clientId,
      schedule_id: input.scheduleId,
      contract_template_id: template?.id ?? null,
      status: 'draft',
      title,
      field_values: {},
      template_snapshot: layout,
    },
    !!layout.background
  )

  try {
    if (layout.background) {
      const sourcePath = contractSourcePdfPath(created)
      if (preparedPdf) {
        await uploadContractPdf(supabaseAdmin, sourcePath, preparedPdf.bytes)
      } else {
        await copyContractStorageObject(supabaseAdmin, layout.background.storagePath, sourcePath)
      }
      layout = normalizeDocumentTemplate(
        { ...layout, background: { ...layout.background, storagePath: sourcePath } },
        'contract'
      )
      await updateSnapshot(supabaseAdmin, created.id, layout)
      created.template_snapshot = layout
    }

    await syncContractDocument(created.id)
  } catch (error) {
    await deleteContractArtifacts(supabaseAdmin, created)
    throw error
  }

  dispatchContractZapier(supabaseAdmin, 'contract_created', created, {
    template_name: template?.name ?? null,
    source: preparedPdf ? 'uploaded_pdf' : 'template',
  })

  return created
}

export type ContractEditorData = {
  summary: ContractSummary
  template: DocumentTemplate
  staffFields: ContractStaffField[]
  fieldValues: Record<string, string>
  editable: boolean
  snapshotsEnabled: boolean
}

export async function getContractEditorData(
  contractId: string,
  companyId: string
): Promise<ContractEditorData> {
  const supabaseAdmin = createSupabaseAdmin()
  const contract = await loadContractRow(supabaseAdmin, contractId, companyId)
  const summary = await getContractSummary(contractId, companyId)
  const template = await resolveContractLayout(supabaseAdmin, contract, summary.jobTitle)
  return {
    summary,
    template,
    staffFields: extractContractStaffFields(template),
    fieldValues: readFieldValues(contract),
    editable: isEditableContractStatus(contract.status),
    snapshotsEnabled: 'template_snapshot' in contract,
  }
}

export async function updateContractDraft(
  contractId: string,
  companyId: string,
  patch: { title?: string; template?: unknown; fieldValues?: Record<string, string> }
): Promise<void> {
  const supabaseAdmin = createSupabaseAdmin()
  const contract = await loadContractRow(supabaseAdmin, contractId, companyId)
  if (!isEditableContractStatus(contract.status)) {
    throw new ContractError('Only draft contracts can be edited. Recall it to make changes.')
  }

  const stored = await resolveContractLayout(supabaseAdmin, contract)
  const layout =
    patch.template !== undefined
      ? lockBackground(normalizeDocumentTemplate(patch.template, 'contract'), stored)
      : stored

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, 160)
    if (!title) throw new ContractError('Contract title is required')
    updates.title = title
  }
  if (patch.template !== undefined) {
    if (!('template_snapshot' in contract)) throw new ContractError(CONTRACTS_V2_MIGRATION_MESSAGE)
    updates.template_snapshot = layout
  }
  if (patch.fieldValues !== undefined) {
    updates.field_values = sanitizeStaffFieldValues(
      extractContractStaffFields(layout),
      readFieldValues(contract),
      patch.fieldValues
    )
  }

  const { error } = await supabaseAdmin
    .from('contracts')
    .update(updates)
    .eq('id', contractId)
    .eq('company_id', companyId)
  if (error) throw error
}

async function postContractToMessages(
  supabaseAdmin: SupabaseClient,
  contract: ContractRecord,
  sender: { userId: string; name: string | null }
) {
  const { getOrCreateMessagingThread, insertMessagingMessage } = await import(
    '@/lib/messaging-server'
  )
  const thread = await getOrCreateMessagingThread(supabaseAdmin, {
    companyId: contract.company_id,
    clientId: contract.client_id,
    scheduleId: contract.schedule_id,
  })
  const portalUrl = `${getAppBaseUrl()}/portal/contracts/${contract.id}`
  await insertMessagingMessage(supabaseAdmin, {
    threadId: thread.id,
    companyId: contract.company_id,
    senderUserId: sender.userId,
    senderRole: 'staff',
    senderName: sender.name,
    body: `"${contract.title}" is ready for you to review and sign: ${portalUrl}`,
  })
}

export async function sendContractToClient(
  contractId: string,
  companyId: string,
  options: {
    notifyClient?: boolean
    postToMessages?: { userId: string; name: string | null } | null
  } = {}
): Promise<{ messagePosted: boolean }> {
  const supabaseAdmin = createSupabaseAdmin()
  const contract = await loadContractRow(supabaseAdmin, contractId, companyId)
  if (contract.status === 'void') throw new ContractError('Cannot send a void contract')
  if (contract.status === 'signed') throw new ContractError('Contract is already signed')

  const layout = await resolveContractLayout(supabaseAdmin, contract)
  const staffCheck = validateContractStaffFields(
    extractContractStaffFields(layout),
    readFieldValues(contract)
  )
  if (!staffCheck.valid) throw new ContractError(staffCheck.error)

  const sentAt = new Date().toISOString()
  const { error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({ status: 'ready_for_signing', sent_at: sentAt, updated_at: sentAt })
    .eq('id', contractId)
  if (updateError) throw updateError

  await syncContractDocument(contractId)

  if (options.notifyClient !== false) {
    void queueNotification(supabaseAdmin, async (admin) => {
      await maybeNotifyContractSent(admin, contractId, false)
    })
  }

  let messagePosted = false
  if (options.postToMessages) {
    try {
      await postContractToMessages(supabaseAdmin, { ...contract, status: 'ready_for_signing' }, options.postToMessages)
      messagePosted = true
    } catch (error) {
      console.error('contract message post failed:', error)
    }
  }

  return { messagePosted }
}

export async function remindContractSigner(contractId: string, companyId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const contract = await loadContractRow(supabaseAdmin, contractId, companyId)
  if (!canSendContractReminder(contract.status, contract.reminder_sent_at)) {
    throw new ContractError(
      contract.status === 'ready_for_signing'
        ? 'A reminder was sent in the last few minutes'
        : 'Only contracts awaiting signature can be reminded'
    )
  }

  const { error } = await supabaseAdmin
    .from('contracts')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', contractId)
  if (error && !isMissingColumnError(error)) throw error

  await maybeNotifyContractSent(supabaseAdmin, contractId, true)
}

/** Pulls a sent contract back to draft so it can be corrected; the portal link stops working. */
export async function recallContract(contractId: string, companyId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const contract = await loadContractRow(supabaseAdmin, contractId, companyId)
  if (!isRecallableContractStatus(contract.status)) {
    throw new ContractError('Only contracts awaiting signature can be recalled')
  }

  const { error } = await supabaseAdmin
    .from('contracts')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', contractId)
    .eq('status', contract.status)
  if (error) throw error

  await syncContractDocument(contractId)
}

export async function voidContract(contractId: string, companyId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const contract = await loadContractRow(supabaseAdmin, contractId, companyId)
  if (contract.status === 'signed') throw new ContractError('Cannot void a signed contract')
  if (contract.status === 'void') return

  const { error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({ status: 'void', updated_at: new Date().toISOString() })
    .eq('id', contractId)
  if (updateError) throw updateError

  await syncContractDocument(contractId)
  dispatchContractZapier(supabaseAdmin, 'contract_voided', contract, {
    previous_status: contract.status,
  })
}

/** Copies a contract (layout, PDF, and staff-entered values) into a new draft. */
export async function duplicateContract(
  contractId: string,
  companyId: string,
  options: { scheduleId?: string | null } = {}
): Promise<ContractRecord> {
  const supabaseAdmin = createSupabaseAdmin()
  const source = await loadContractRow(supabaseAdmin, contractId, companyId)
  const layout = await resolveContractLayout(supabaseAdmin, source)

  const scheduleId = options.scheduleId === undefined ? source.schedule_id : options.scheduleId
  if (scheduleId && scheduleId !== source.schedule_id) {
    const { data: schedule } = await supabaseAdmin
      .from('schedules')
      .select('client_id')
      .eq('id', scheduleId)
      .maybeSingle()
    if (!schedule || schedule.client_id !== source.client_id) throw new ContractError('Job not found')
  }

  const staffValues = sanitizeStaffFieldValues(
    extractContractStaffFields(layout),
    {},
    readFieldValues(source)
  )

  const created = await insertContractRow(
    supabaseAdmin,
    {
      company_id: source.company_id,
      client_id: source.client_id,
      schedule_id: scheduleId,
      contract_template_id: source.contract_template_id,
      status: 'draft',
      title: source.title,
      field_values: staffValues,
      template_snapshot: layout,
    },
    !!layout.background
  )

  try {
    if (layout.background) {
      const sourcePath = contractSourcePdfPath(created)
      await copyContractStorageObject(supabaseAdmin, layout.background.storagePath, sourcePath)
      const nextLayout = normalizeDocumentTemplate(
        { ...layout, background: { ...layout.background, storagePath: sourcePath } },
        'contract'
      )
      await updateSnapshot(supabaseAdmin, created.id, nextLayout)
    }
    await syncContractDocument(created.id)
  } catch (error) {
    await deleteContractArtifacts(supabaseAdmin, created)
    throw error
  }

  dispatchContractZapier(supabaseAdmin, 'contract_created', created, {
    template_name: null,
    source: 'duplicate',
  })
  return created
}

async function deleteContractArtifacts(supabaseAdmin: SupabaseClient, contract: ContractRecord) {
  const folder = contractFolder(contract)
  const { data: files } = await supabaseAdmin.storage.from(CONTRACT_STORAGE_BUCKET).list(folder)
  const paths = [
    `${contract.company_id}/${contract.client_id}/contracts/${contract.id}.pdf`,
    ...(files || []).map((file) => `${folder}/${file.name}`),
  ]
  await supabaseAdmin.storage.from(CONTRACT_STORAGE_BUCKET).remove(paths)
  await supabaseAdmin.from('client_documents').delete().eq('contract_id', contract.id)
  await supabaseAdmin.from('contracts').delete().eq('id', contract.id)
}

export async function deleteContract(contractId: string, companyId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const contract = await loadContractRow(supabaseAdmin, contractId, companyId)
  if (!isDeletableContractStatus(contract.status)) {
    throw new ContractError('Only draft or void contracts can be deleted')
  }
  await deleteContractArtifacts(supabaseAdmin, contract)
}

async function maybeNotifyContractSent(
  supabaseAdmin: SupabaseClient,
  contractId: string,
  reminder: boolean
) {
  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select(`
      id,
      title,
      company_id,
      client_id,
      schedule_id,
      client:clients!client_id (name, email, phone, portal_enabled),
      company:companies!company_id (name)
    `)
    .eq('id', contractId)
    .single()

  if (!contract) return

  const client = one((contract as { client?: unknown }).client) as {
    name?: string
    email?: string
    phone?: string
  } | null
  const company = one((contract as { company?: unknown }).company) as { name?: string } | null

  if (!client?.email && !client?.phone) return

  await notifyClientContractSent(supabaseAdmin, {
    companyId: contract.company_id,
    companyName: company?.name,
    clientId: contract.client_id,
    clientEmail: client?.email,
    clientPhone: client?.phone,
    clientName: client?.name,
    contractTitle: contract.title,
    contractId: contract.id,
    scheduleId: contract.schedule_id,
    reminder,
  })
}

/** Contract layout and client-facing requirements for the portal signing page. */
export async function loadContractSigningLayout(
  supabaseAdmin: SupabaseClient,
  contract: ContractRecord,
  scheduleTitle?: string | null
) {
  const layout = await resolveContractLayout(supabaseAdmin, contract, scheduleTitle)
  return { layout, requirements: extractContractSigningRequirements(layout) }
}

export async function signContractByClient(
  contractId: string,
  clientId: string,
  input: {
    signedName: string
    fieldValues: Record<string, string>
    signatureDataUrl?: string | null
    initialsDataUrl?: string | null
  },
  meta: { ip?: string | null; userAgent?: string | null } = {}
) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select(`*, schedule:schedules!schedule_id (title)`)
    .eq('id', contractId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (error && error.code !== '22P02') throw error
  if (!contract) throw new ContractError('Contract not found')
  if (contract.status !== 'ready_for_signing') {
    throw new ContractError('This contract is not available for signing')
  }

  const schedule = one((contract as { schedule?: { title?: string } | { title?: string }[] }).schedule)
  const { requirements } = await loadContractSigningLayout(
    supabaseAdmin,
    contract as ContractRecord,
    schedule?.title || contract.title
  )

  const validation = validateContractSigningSubmission(requirements, input)
  if (!validation.valid) throw new ContractError(validation.error)

  const signatureBytes = input.signatureDataUrl ? parseSignatureDataUrl(input.signatureDataUrl) : null
  const initialsBytes = input.initialsDataUrl ? parseSignatureDataUrl(input.initialsDataUrl) : null
  const folder = contractFolder(contract as ContractRecord)

  let signaturePath: string | null = null
  let initialsPath: string | null = null

  if (signatureBytes && requirements.requiresSignature) {
    signaturePath = `${folder}/client-signature.png`
    const { error: uploadError } = await supabaseAdmin.storage
      .from(CONTRACT_STORAGE_BUCKET)
      .upload(signaturePath, signatureBytes, { contentType: 'image/png', upsert: true })
    if (uploadError) throw new Error(uploadError.message || 'Could not save signature')
  }

  if (initialsBytes && requirements.requiresInitials) {
    initialsPath = `${folder}/client-initials.png`
    const { error: uploadError } = await supabaseAdmin.storage
      .from(CONTRACT_STORAGE_BUCKET)
      .upload(initialsPath, initialsBytes, { contentType: 'image/png', upsert: true })
    if (uploadError) throw new Error(uploadError.message || 'Could not save initials')
  }

  const signedAt = new Date().toISOString()
  const fieldValues = mergeClientSigningValues(
    requirements,
    readFieldValues(contract as ContractRecord),
    input.fieldValues
  )

  const baseUpdate = {
    status: 'signed',
    client_signed_at: signedAt,
    client_signed_name: input.signedName.trim(),
    client_signature_storage_path: signaturePath,
    client_initials_storage_path: initialsPath,
    field_values: fieldValues,
    updated_at: signedAt,
  }
  const auditUpdate = {
    client_signed_ip: meta.ip?.slice(0, 64) || null,
    client_signed_user_agent: meta.userAgent?.slice(0, 300) || null,
  }

  // The status guard makes a double submit a no-op instead of a second signing.
  let update = await supabaseAdmin
    .from('contracts')
    .update({ ...baseUpdate, ...auditUpdate })
    .eq('id', contractId)
    .eq('status', 'ready_for_signing')
    .select('id')
  if (update.error && isMissingColumnError(update.error)) {
    update = await supabaseAdmin
      .from('contracts')
      .update(baseUpdate)
      .eq('id', contractId)
      .eq('status', 'ready_for_signing')
      .select('id')
  }
  if (update.error) throw update.error
  if (!update.data?.length) throw new ContractError('This contract is not available for signing')

  await syncContractDocument(contractId)

  void queueNotification(supabaseAdmin, async (admin) => {
    await maybeNotifyContractSigned(admin, contractId)
  })

  const { data: refreshed } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .single()

  return refreshed as ContractRecord
}

async function maybeNotifyContractSigned(supabaseAdmin: SupabaseClient, contractId: string) {
  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select(`
      id,
      title,
      company_id,
      client_id,
      schedule_id,
      client_signed_name,
      client_signed_at,
      field_values,
      client:clients!client_id (name),
      company:companies!company_id (name)
    `)
    .eq('id', contractId)
    .single()

  if (!contract) return

  const client = one((contract as { client?: unknown }).client) as { name?: string } | null
  const company = one((contract as { company?: unknown }).company) as { name?: string } | null

  await notifyStaffContractSigned(supabaseAdmin, {
    companyId: contract.company_id,
    companyName: company?.name,
    clientId: contract.client_id,
    clientName: client?.name,
    contractTitle: contract.title,
    contractId: contract.id,
    scheduleId: contract.schedule_id,
    signedName: contract.client_signed_name,
    signedAt: contract.client_signed_at,
    fieldValues: readFieldValues(contract),
  })
}
