import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getDisplayAddressFromClient } from '@/lib/address'
import { generateContractPdf } from '@/lib/contract-pdf'
import { resolveContractTemplateForSchedule } from '@/lib/contract-templates-server'
import {
  extractContractSigningRequirements,
  parseSignatureDataUrl,
  validateContractSigningSubmission,
} from '@/lib/contract-signing'
import { loadContractTemplateById } from '@/lib/contract-templates-server'
import {
  formatContractNumber,
  type ContractRecord,
} from '@/lib/contracts'
import { normalizeDocumentTemplate } from '@/lib/document-template'
import { SYSTEM_DOCUMENT_CATEGORY_CONTRACTS } from '@/lib/document-categories'
import {
  notifyClientContractSent,
  notifyStaffContractSigned,
  queueNotification,
} from '@/lib/notifications-server'

const BUCKET = 'client-documents'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function loadStorageBytes(
  supabaseAdmin: SupabaseClient,
  path: string | null | undefined
): Promise<Uint8Array | null> {
  if (!path) return null
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

async function findExistingContractDocument(
  supabaseAdmin: SupabaseClient,
  contractId: string
) {
  const { data } = await supabaseAdmin
    .from('client_documents')
    .select('id, storage_path, source')
    .eq('contract_id', contractId)
    .eq('source', 'contract')
    .maybeSingle()

  return data
}

async function upsertContractDocumentRow(
  supabaseAdmin: SupabaseClient,
  input: {
    contractId: string
    scheduleId: string
    clientId: string
    companyId: string
    fileName: string
    storagePath: string
    existingDoc: { id: string; storage_path: string; source: string } | null
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
    return {
      documentId: input.existingDoc.id,
      fileName: input.fileName,
      storagePath: input.storagePath,
    }
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('client_documents')
    .insert({
      client_id: input.clientId,
      company_id: input.companyId,
      ...row,
      source: 'contract',
    })
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
    .insert({
      client_id: input.clientId,
      company_id: input.companyId,
      ...row,
      source: 'upload',
    })
    .select('id')
    .single()

  if (fallbackError) {
    throw new Error(
      fallbackError.message ||
        'Could not save contract document. Run supabase/contracts-schema.sql in Supabase.'
    )
  }

  return {
    documentId: fallbackInserted.id,
    fileName: input.fileName,
    storagePath: input.storagePath,
  }
}

export async function getActiveContractForSchedule(
  scheduleId: string
): Promise<ContractRecord | null> {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('schedule_id', scheduleId)
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') return null
    throw error
  }

  return (data as ContractRecord | null) ?? null
}

export async function syncContractDocument(contractId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select(`
      *,
      schedule:schedules!schedule_id (
        id,
        title,
        start_time
      ),
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
      company:companies!company_id (name, address, phone),
      template:contract_templates!contract_template_id (template)
    `)
    .eq('id', contractId)
    .single()

  if (error || !contract) throw new Error('Contract not found')
  if (!contract.schedule_id) throw new Error('Contract is not linked to a job')

  const schedule = Array.isArray((contract as any).schedule)
    ? (contract as any).schedule[0]
    : (contract as any).schedule
  const client = Array.isArray((contract as any).client)
    ? (contract as any).client[0]
    : (contract as any).client
  const company = Array.isArray((contract as any).company)
    ? (contract as any).company[0]
    : (contract as any).company
  const templateRow = Array.isArray((contract as any).template)
    ? (contract as any).template[0]
    : (contract as any).template

  let documentTemplate = templateRow?.template
  if (!documentTemplate) {
    const resolved = await resolveContractTemplateForSchedule(
      supabaseAdmin,
      contract.company_id,
      schedule?.title
    )
    documentTemplate = resolved.template
  }

  const { loadCompanyLogoBytesForPdf } = await import('@/lib/document-template-logo-server')
  const logoBytes = await loadCompanyLogoBytesForPdf(contract.company_id)

  const visitDate = schedule?.start_time
    ? new Date(schedule.start_time).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  const signedDate = contract.client_signed_at
    ? new Date(contract.client_signed_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  const contractNumber = formatContractNumber(contract.id, contract.created_at)
  const fieldValues =
    contract.field_values && typeof contract.field_values === 'object'
      ? (contract.field_values as Record<string, string>)
      : {}

  const [clientSignature, clientInitials] = await Promise.all([
    loadStorageBytes(supabaseAdmin, contract.client_signature_storage_path),
    loadStorageBytes(supabaseAdmin, contract.client_initials_storage_path),
  ])

  const pdfBytes = await generateContractPdf({
    contract: {
      number: contractNumber,
      issuedAt: contract.created_at,
      title: contract.title,
      serviceName: schedule?.title || null,
      signedDate,
      jobTitle: schedule?.title || contract.title,
      visitDate,
    },
    company: {
      name: company?.name || 'Company',
      address: company?.address || null,
      phone: company?.phone || null,
      logoBytes,
    },
    client: {
      name: client?.name || 'Client',
      contact_name: client?.contact_name,
      email: client?.email,
      phone: client?.phone,
      address: client
        ? getDisplayAddressFromClient(
            client as Parameters<typeof getDisplayAddressFromClient>[0]
          )
        : null,
    },
    template: documentTemplate,
    fieldValues,
    signatures: {
      client: clientSignature,
      clientInitials,
    },
  })

  const storagePath = `${contract.company_id}/${contract.client_id}/contracts/${contract.id}.pdf`
  const fileName = `${contractNumber}.pdf`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    throw new Error(uploadError.message || 'Could not upload contract PDF to storage')
  }

  await supabaseAdmin
    .from('contracts')
    .update({
      storage_path: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)

  const existingDoc = await findExistingContractDocument(supabaseAdmin, contractId)

  return upsertContractDocumentRow(supabaseAdmin, {
    contractId,
    scheduleId: contract.schedule_id,
    clientId: contract.client_id,
    companyId: contract.company_id,
    fileName,
    storagePath,
    existingDoc,
  })
}

export async function createContractForSchedule(scheduleId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const existing = await getActiveContractForSchedule(scheduleId)
  if (existing) {
    throw new Error('This job already has an active contract')
  }

  const { data: schedule, error } = await supabaseAdmin
    .from('schedules')
    .select(`
      id,
      title,
      client_id,
      client:clients!client_id (company_id)
    `)
    .eq('id', scheduleId)
    .single()

  if (error || !schedule) throw new Error('Job not found')

  const client = Array.isArray((schedule as { client?: { company_id?: string }[] | { company_id?: string } }).client)
    ? (schedule as { client: { company_id?: string }[] }).client[0]
    : (schedule as { client?: { company_id?: string } }).client
  const companyId = client?.company_id
  if (!companyId) throw new Error('Job not found')

  const template = await resolveContractTemplateForSchedule(
    supabaseAdmin,
    companyId,
    schedule.title
  )

  const title = schedule.title?.trim()
    ? `Service Agreement — ${schedule.title.trim()}`
    : 'Service Agreement'

  const { data: created, error: createError } = await supabaseAdmin
    .from('contracts')
    .insert({
      company_id: companyId,
      client_id: schedule.client_id,
      schedule_id: scheduleId,
      contract_template_id: template.id,
      status: 'draft',
      title,
      field_values: {},
    })
    .select('*')
    .single()

  if (createError) {
    throw new Error(
      createError.message ||
        'Could not create contract. Run supabase/contracts-schema.sql in Supabase.'
    )
  }

  await syncContractDocument(created.id)
  return created as ContractRecord
}

export async function sendContractToClient(contractId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('id, status, company_id, client_id, schedule_id, title')
    .eq('id', contractId)
    .single()

  if (error || !contract) throw new Error('Contract not found')
  if (contract.status === 'void') throw new Error('Cannot send a void contract')
  if (contract.status === 'signed') throw new Error('Contract is already signed')

  const sentAt = new Date().toISOString()
  const { error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({
      status: 'ready_for_signing',
      sent_at: sentAt,
      updated_at: sentAt,
    })
    .eq('id', contractId)

  if (updateError) throw updateError

  await syncContractDocument(contractId)

  void queueNotification(supabaseAdmin, async (admin) => {
    await maybeNotifyContractSent(admin, contractId)
  })

  const { data: refreshed } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .single()

  return refreshed as ContractRecord
}

export async function voidContract(contractId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('id, status')
    .eq('id', contractId)
    .single()

  if (error || !contract) throw new Error('Contract not found')
  if (contract.status === 'signed') throw new Error('Cannot void a signed contract')

  const updatedAt = new Date().toISOString()
  const { error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({
      status: 'void',
      updated_at: updatedAt,
    })
    .eq('id', contractId)

  if (updateError) throw updateError

  await syncContractDocument(contractId)

  const { data: refreshed } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .single()

  return refreshed as ContractRecord
}

async function maybeNotifyContractSent(
  supabaseAdmin: SupabaseClient,
  contractId: string
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

  const client = Array.isArray((contract as any).client)
    ? (contract as any).client[0]
    : (contract as any).client
  const company = Array.isArray((contract as any).company)
    ? (contract as any).company[0]
    : (contract as any).company

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
  })
}

async function resolveContractTemplateForSigning(
  supabaseAdmin: SupabaseClient,
  contract: {
    company_id: string
    contract_template_id: string | null
    schedule_id: string | null
    title: string
  },
  scheduleTitle?: string | null
) {
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
    scheduleTitle
  )
  return resolved.template
}

export async function signContractByClient(
  contractId: string,
  clientId: string,
  input: {
    signedName: string
    fieldValues: Record<string, string>
    signatureDataUrl?: string | null
    initialsDataUrl?: string | null
  }
) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select(`
      *,
      schedule:schedules!schedule_id (title)
    `)
    .eq('id', contractId)
    .eq('client_id', clientId)
    .single()

  if (error || !contract) throw new Error('Contract not found')
  if (contract.status !== 'ready_for_signing') {
    throw new Error('This contract is not available for signing')
  }

  const schedule = Array.isArray((contract as { schedule?: { title?: string }[] | { title?: string } }).schedule)
    ? (contract as { schedule: { title?: string }[] }).schedule[0]
    : (contract as { schedule?: { title?: string } }).schedule

  const template = await resolveContractTemplateForSigning(
    supabaseAdmin,
    contract,
    schedule?.title || contract.title
  )
  const requirements = extractContractSigningRequirements(
    normalizeDocumentTemplate(template, 'contract')
  )

  const validation = validateContractSigningSubmission(requirements, input)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const signatureBytes = input.signatureDataUrl
    ? parseSignatureDataUrl(input.signatureDataUrl)
    : null
  const initialsBytes = input.initialsDataUrl
    ? parseSignatureDataUrl(input.initialsDataUrl)
    : null

  let signaturePath: string | null = null
  let initialsPath: string | null = null

  if (signatureBytes) {
    signaturePath = `${contract.company_id}/${contract.client_id}/contracts/${contract.id}/client-signature.png`
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(signaturePath, signatureBytes, {
        contentType: 'image/png',
        upsert: true,
      })
    if (uploadError) throw new Error(uploadError.message || 'Could not save signature')
  }

  if (initialsBytes) {
    initialsPath = `${contract.company_id}/${contract.client_id}/contracts/${contract.id}/client-initials.png`
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(initialsPath, initialsBytes, {
        contentType: 'image/png',
        upsert: true,
      })
    if (uploadError) throw new Error(uploadError.message || 'Could not save initials')
  }

  const signedAt = new Date().toISOString()
  const normalizedFieldValues = Object.fromEntries(
    Object.entries(input.fieldValues).map(([key, value]) => [key, value.trim()])
  )

  const { error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({
      status: 'signed',
      client_signed_at: signedAt,
      client_signed_name: input.signedName.trim(),
      client_signature_storage_path: signaturePath,
      client_initials_storage_path: initialsPath,
      field_values: normalizedFieldValues,
      updated_at: signedAt,
    })
    .eq('id', contractId)

  if (updateError) throw updateError

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

async function maybeNotifyContractSigned(
  supabaseAdmin: SupabaseClient,
  contractId: string
) {
  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select(`
      id,
      title,
      company_id,
      client_id,
      schedule_id,
      client:clients!client_id (name),
      company:companies!company_id (name)
    `)
    .eq('id', contractId)
    .single()

  if (!contract) return

  const client = Array.isArray((contract as { client?: { name?: string }[] | { name?: string } }).client)
    ? (contract as { client: { name?: string }[] }).client[0]
    : (contract as { client?: { name?: string } }).client
  const company = Array.isArray((contract as { company?: { name?: string }[] | { name?: string } }).company)
    ? (contract as { company: { name?: string }[] }).company[0]
    : (contract as { company?: { name?: string } }).company

  await notifyStaffContractSigned(supabaseAdmin, {
    companyId: contract.company_id,
    companyName: company?.name,
    clientId: contract.client_id,
    clientName: client?.name,
    contractTitle: contract.title,
    contractId: contract.id,
    scheduleId: contract.schedule_id,
  })
}