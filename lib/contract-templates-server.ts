import type { SupabaseClient } from '@supabase/supabase-js'
import { prepareContractPdf, sanitizePdfFileName } from '@/lib/contract-pdf-source'
import { getContractStarter, type ContractStarterId } from '@/lib/contract-template-library'
import {
  buildNewContractTemplatePayload,
  buildPdfContractTemplate,
  contractTemplateNameOrFallback,
  normalizeContractTemplateRecord,
  pickDefaultContractTemplate,
  toContractTemplateListItem,
  toContractTemplateOption,
  type ContractTemplateOption,
  type ContractTemplateRecord,
  type ContractTemplatesPageData,
} from '@/lib/contract-templates'
import { normalizeDocumentTemplate, type DocumentTemplate } from '@/lib/document-template'

export const CONTRACT_STORAGE_BUCKET = 'client-documents'

export const CONTRACTS_V2_MIGRATION_MESSAGE =
  'Run supabase/contracts-v2-schema.sql in Supabase to enable the contract template library.'

export class ContractTemplateError extends Error {}

type PostgrestLikeError = { code?: string; message?: string } | null | undefined

export function isMissingColumnError(error: PostgrestLikeError) {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

function toMigrationError(error: PostgrestLikeError): Error {
  if (isMissingColumnError(error) || error?.code === '23505') {
    return new ContractTemplateError(CONTRACTS_V2_MIGRATION_MESSAGE)
  }
  return new Error(error?.message || 'Contract template request failed')
}

/** Company files all live under `${companyId}/` in the private documents bucket. */
export function isCompanyStoragePath(companyId: string, path: string | null | undefined) {
  return !!path && path.startsWith(`${companyId}/`) && !path.includes('..')
}

export async function loadContractStorageBytes(
  supabaseAdmin: SupabaseClient,
  path: string | null | undefined
): Promise<Uint8Array | null> {
  if (!path) return null
  const { data, error } = await supabaseAdmin.storage.from(CONTRACT_STORAGE_BUCKET).download(path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

let librarySchemaDetected = false

export async function hasContractLibrarySchema(supabaseAdmin: SupabaseClient): Promise<boolean> {
  if (librarySchemaDetected) return true
  const { error } = await supabaseAdmin.from('contract_templates').select('is_default').limit(1)
  if (!error) {
    librarySchemaDetected = true
    return true
  }
  if (isMissingColumnError(error)) return false
  throw error
}

export async function loadCompanyContractTemplates(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<ContractTemplateRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('contract_templates')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })

  if (error) {
    if (error.code === '42P01') return []
    throw error
  }

  return (data || []).map((row) => normalizeContractTemplateRecord(row as ContractTemplateRecord))
}

export async function ensureDefaultContractTemplate(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<ContractTemplateRecord> {
  const existing = pickDefaultContractTemplate(
    await loadCompanyContractTemplates(supabaseAdmin, companyId)
  )
  if (existing) return existing

  const payload = buildNewContractTemplatePayload()
  const row = {
    company_id: companyId,
    service_package_id: null,
    name: payload.name,
    template: payload.template,
    active: true,
  }

  let result = await supabaseAdmin
    .from('contract_templates')
    .insert({ ...row, is_default: true, source_type: 'builder' })
    .select('*')
    .single()

  if (result.error && isMissingColumnError(result.error)) {
    result = await supabaseAdmin.from('contract_templates').insert(row).select('*').single()
  }

  if (result.error) throw result.error
  return normalizeContractTemplateRecord(result.data as ContractTemplateRecord)
}

export async function loadContractTemplateById(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  templateId: string
): Promise<ContractTemplateRecord | null> {
  const { data, error } = await supabaseAdmin
    .from('contract_templates')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', templateId)
    .maybeSingle()

  if (error) {
    // Malformed ids (e.g. a stale client) are "not found", not a server error.
    if (error.code === '22P02') return null
    throw error
  }
  if (!data) return null
  return normalizeContractTemplateRecord(data as ContractTemplateRecord)
}

type ServicePackageRow = {
  id: string
  name: string
  active: boolean
  contract_template_id?: string | null
}

async function loadServicePackages(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<{ packages: ServicePackageRow[]; hasAssignments: boolean }> {
  const query = (columns: string) =>
    supabaseAdmin
      .from('bookable_services')
      .select(columns)
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

  const withAssignments = await query('id, name, active, contract_template_id')
  if (!withAssignments.error) {
    return {
      packages: (withAssignments.data || []) as unknown as ServicePackageRow[],
      hasAssignments: true,
    }
  }
  if (withAssignments.error.code === '42P01') return { packages: [], hasAssignments: false }
  if (!isMissingColumnError(withAssignments.error)) throw withAssignments.error

  const legacy = await query('id, name, active')
  if (legacy.error) {
    if (legacy.error.code === '42P01') return { packages: [], hasAssignments: false }
    throw legacy.error
  }
  return {
    packages: (legacy.data || []) as unknown as ServicePackageRow[],
    hasAssignments: false,
  }
}

function resolvePackageTemplateId(
  pkg: ServicePackageRow,
  hasAssignments: boolean,
  templates: ContractTemplateRecord[]
): string | null {
  if (hasAssignments) return pkg.contract_template_id ?? null
  return templates.find((template) => template.service_package_id === pkg.id)?.id ?? null
}

export async function loadContractTemplatesPageData(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<ContractTemplatesPageData> {
  const defaultTemplate = await ensureDefaultContractTemplate(supabaseAdmin, companyId)
  const [templates, { packages, hasAssignments }, libraryEnabled] = await Promise.all([
    loadCompanyContractTemplates(supabaseAdmin, companyId),
    loadServicePackages(supabaseAdmin, companyId),
    hasContractLibrarySchema(supabaseAdmin),
  ])

  const packageNamesByTemplate = new Map<string, string[]>()
  const servicePackages = packages.map((pkg) => {
    const templateId = resolvePackageTemplateId(pkg, hasAssignments, templates)
    if (templateId) {
      packageNamesByTemplate.set(templateId, [
        ...(packageNamesByTemplate.get(templateId) || []),
        pkg.name,
      ])
    }
    return { id: pkg.id, name: pkg.name, active: pkg.active, templateId }
  })

  const items = templates
    .map((record) =>
      toContractTemplateListItem(
        { ...record, is_default: record.id === defaultTemplate.id },
        packageNamesByTemplate.get(record.id) || []
      )
    )
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))

  return {
    templates: items,
    defaultTemplateId: defaultTemplate.id,
    servicePackages,
    libraryEnabled,
  }
}

export async function listContractTemplateOptions(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<ContractTemplateOption[]> {
  const defaultTemplate = await ensureDefaultContractTemplate(supabaseAdmin, companyId)
  const templates = await loadCompanyContractTemplates(supabaseAdmin, companyId)
  return templates
    .filter((record) => record.active)
    .map((record) =>
      toContractTemplateOption({ ...record, is_default: record.id === defaultTemplate.id })
    )
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
}

async function insertLibraryTemplate(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  input: {
    name: string
    description?: string | null
    template: DocumentTemplate
    sourceType: 'builder' | 'pdf'
  }
): Promise<ContractTemplateRecord> {
  if (!(await hasContractLibrarySchema(supabaseAdmin))) {
    throw new ContractTemplateError(CONTRACTS_V2_MIGRATION_MESSAGE)
  }

  const { data, error } = await supabaseAdmin
    .from('contract_templates')
    .insert({
      company_id: companyId,
      service_package_id: null,
      name: input.name,
      description: input.description ?? null,
      template: normalizeDocumentTemplate(input.template, 'contract'),
      active: true,
      is_default: false,
      source_type: input.sourceType,
    })
    .select('*')
    .single()

  if (error) throw toMigrationError(error)
  return normalizeContractTemplateRecord(data as ContractTemplateRecord)
}

export async function createContractTemplateFromStarter(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  input: { starterId: ContractStarterId; name?: string | null }
): Promise<ContractTemplateRecord> {
  const starter = getContractStarter(input.starterId)
  if (!starter) throw new ContractTemplateError('Unknown starter template')

  return insertLibraryTemplate(supabaseAdmin, companyId, {
    name: contractTemplateNameOrFallback(input.name, starter.name),
    description: starter.description,
    template: starter.build(),
    sourceType: 'builder',
  })
}

function contractTemplatePdfPath(companyId: string, templateId: string, fileName: string) {
  return `${companyId}/contract-templates/${templateId}/${Date.now()}-${sanitizePdfFileName(fileName)}`
}

export async function uploadContractPdf(
  supabaseAdmin: SupabaseClient,
  storagePath: string,
  bytes: Uint8Array
) {
  const { error } = await supabaseAdmin.storage
    .from(CONTRACT_STORAGE_BUCKET)
    .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(error.message || 'Could not store the PDF')
}

async function removeStorageObjects(supabaseAdmin: SupabaseClient, paths: Array<string | null | undefined>) {
  const valid = paths.filter((path): path is string => !!path)
  if (valid.length === 0) return
  await supabaseAdmin.storage.from(CONTRACT_STORAGE_BUCKET).remove(valid)
}

export async function createContractTemplateFromPdf(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  input: { name?: string | null; fileName: string; bytes: Uint8Array }
): Promise<ContractTemplateRecord> {
  const prepared = await prepareContractPdf(input.bytes)
  const baseName = input.fileName.replace(/\.pdf$/i, '').trim()

  const record = await insertLibraryTemplate(supabaseAdmin, companyId, {
    name: contractTemplateNameOrFallback(input.name, baseName || 'Uploaded contract'),
    template: buildPdfContractTemplate({
      storagePath: `${companyId}/contract-templates/pending.pdf`,
      fileName: input.fileName,
      pageSizes: prepared.pageSizes,
    }),
    sourceType: 'pdf',
  })

  const storagePath = contractTemplatePdfPath(companyId, record.id, input.fileName)
  try {
    await uploadContractPdf(supabaseAdmin, storagePath, prepared.bytes)
    const template = buildPdfContractTemplate({
      storagePath,
      fileName: input.fileName,
      pageSizes: prepared.pageSizes,
    })
    const { data, error } = await supabaseAdmin
      .from('contract_templates')
      .update({ template, updated_at: new Date().toISOString() })
      .eq('id', record.id)
      .eq('company_id', companyId)
      .select('*')
      .single()
    if (error) throw error
    return normalizeContractTemplateRecord(data as ContractTemplateRecord)
  } catch (error) {
    await supabaseAdmin.from('contract_templates').delete().eq('id', record.id)
    await removeStorageObjects(supabaseAdmin, [storagePath])
    throw error
  }
}

/** Swaps the PDF under an existing template, keeping every placed field that still fits. */
export async function replaceContractTemplatePdf(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  templateId: string,
  input: { fileName: string; bytes: Uint8Array }
): Promise<ContractTemplateRecord> {
  const record = await loadContractTemplateById(supabaseAdmin, companyId, templateId)
  if (!record) throw new ContractTemplateError('Contract template not found')

  const prepared = await prepareContractPdf(input.bytes)
  const storagePath = contractTemplatePdfPath(companyId, templateId, input.fileName)
  await uploadContractPdf(supabaseAdmin, storagePath, prepared.bytes)

  const template = buildPdfContractTemplate({
    storagePath,
    fileName: input.fileName,
    pageSizes: prepared.pageSizes,
    elements: record.template.elements,
  })

  const updates: Record<string, unknown> = { template, updated_at: new Date().toISOString() }
  if (await hasContractLibrarySchema(supabaseAdmin)) updates.source_type = 'pdf'

  const { data, error } = await supabaseAdmin
    .from('contract_templates')
    .update(updates)
    .eq('id', templateId)
    .eq('company_id', companyId)
    .select('*')
    .single()

  if (error) {
    await removeStorageObjects(supabaseAdmin, [storagePath])
    throw error
  }

  const previousPath = record.template.background?.storagePath
  if (previousPath && previousPath !== storagePath && isCompanyStoragePath(companyId, previousPath)) {
    await removeStorageObjects(supabaseAdmin, [previousPath])
  }

  return normalizeContractTemplateRecord(data as ContractTemplateRecord)
}

/**
 * Saves editor changes. The PDF background is never taken from the client: it can only be
 * set by an upload, so a crafted request can't point a template at another company's file.
 */
export async function updateContractTemplateRecord(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  templateId: string,
  patch: {
    name?: string
    description?: string | null
    template?: unknown
    active?: boolean
  }
): Promise<ContractTemplateRecord> {
  const current = await loadContractTemplateById(supabaseAdmin, companyId, templateId)
  if (!current) throw new ContractTemplateError('Contract template not found')

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (patch.name !== undefined) {
    updates.name = contractTemplateNameOrFallback(patch.name, current.name)
  }
  if (patch.description !== undefined && (await hasContractLibrarySchema(supabaseAdmin))) {
    updates.description = patch.description?.trim().slice(0, 300) || null
  }
  if (patch.template !== undefined) {
    const incoming = normalizeDocumentTemplate(patch.template, 'contract')
    updates.template = normalizeDocumentTemplate(
      {
        ...incoming,
        background: current.template.background,
        pages: current.template.background ? current.template.pages : incoming.pages,
      },
      'contract'
    )
  }
  if (patch.active !== undefined) updates.active = patch.active

  const { data, error } = await supabaseAdmin
    .from('contract_templates')
    .update(updates)
    .eq('company_id', companyId)
    .eq('id', templateId)
    .select('*')
    .single()

  if (error) throw error
  return normalizeContractTemplateRecord(data as ContractTemplateRecord)
}

export async function copyContractStorageObject(
  supabaseAdmin: SupabaseClient,
  fromPath: string,
  toPath: string
) {
  const { error } = await supabaseAdmin.storage.from(CONTRACT_STORAGE_BUCKET).copy(fromPath, toPath)
  if (!error) return
  // Some storage setups reject copy onto an existing key; fall back to download + upload.
  const bytes = await loadContractStorageBytes(supabaseAdmin, fromPath)
  if (!bytes) throw new Error('The contract PDF could not be copied')
  await uploadContractPdf(supabaseAdmin, toPath, bytes)
}

export async function duplicateContractTemplate(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  templateId: string
): Promise<ContractTemplateRecord> {
  const source = await loadContractTemplateById(supabaseAdmin, companyId, templateId)
  if (!source) throw new ContractTemplateError('Contract template not found')

  const copy = await insertLibraryTemplate(supabaseAdmin, companyId, {
    name: `${source.name} (copy)`.slice(0, 120),
    description: source.description,
    template: { ...source.template, background: undefined },
    sourceType: source.source_type,
  })

  const background = source.template.background
  if (!background) return copy

  const storagePath = contractTemplatePdfPath(companyId, copy.id, background.fileName)
  try {
    await copyContractStorageObject(supabaseAdmin, background.storagePath, storagePath)
    return await updateBackgroundDirect(supabaseAdmin, companyId, copy.id, {
      ...source.template,
      background: { ...background, storagePath },
    })
  } catch (error) {
    await supabaseAdmin.from('contract_templates').delete().eq('id', copy.id)
    throw error
  }
}

async function updateBackgroundDirect(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  templateId: string,
  template: DocumentTemplate
) {
  const { data, error } = await supabaseAdmin
    .from('contract_templates')
    .update({
      template: normalizeDocumentTemplate(template, 'contract'),
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)
    .eq('company_id', companyId)
    .select('*')
    .single()
  if (error) throw error
  return normalizeContractTemplateRecord(data as ContractTemplateRecord)
}

export async function deleteContractTemplate(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  templateId: string
): Promise<void> {
  const record = await loadContractTemplateById(supabaseAdmin, companyId, templateId)
  if (!record) throw new ContractTemplateError('Contract template not found')

  const defaultTemplate = await ensureDefaultContractTemplate(supabaseAdmin, companyId)
  if (defaultTemplate.id === templateId) {
    throw new ContractTemplateError('Choose a different default template before deleting this one')
  }

  const { error } = await supabaseAdmin
    .from('contract_templates')
    .delete()
    .eq('company_id', companyId)
    .eq('id', templateId)
  if (error) throw error

  // Contracts copy the PDF when they are created, so the template file is safe to remove.
  const path = record.template.background?.storagePath
  if (isCompanyStoragePath(companyId, path)) {
    await removeStorageObjects(supabaseAdmin, [path])
  }
}

export async function setDefaultContractTemplate(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  templateId: string
): Promise<void> {
  if (!(await hasContractLibrarySchema(supabaseAdmin))) {
    throw new ContractTemplateError(CONTRACTS_V2_MIGRATION_MESSAGE)
  }
  const record = await loadContractTemplateById(supabaseAdmin, companyId, templateId)
  if (!record) throw new ContractTemplateError('Contract template not found')

  // Clear first: a partial unique index allows only one default per company.
  const { error: clearError } = await supabaseAdmin
    .from('contract_templates')
    .update({ is_default: false })
    .eq('company_id', companyId)
    .eq('is_default', true)
  if (clearError) throw clearError

  const { error } = await supabaseAdmin
    .from('contract_templates')
    .update({ is_default: true, active: true, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', templateId)
  if (error) throw error
}

export async function assignServicePackageContractTemplate(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  servicePackageId: string,
  templateId: string | null
): Promise<void> {
  if (templateId) {
    const record = await loadContractTemplateById(supabaseAdmin, companyId, templateId)
    if (!record) throw new ContractTemplateError('Contract template not found')
  }

  const { data, error } = await supabaseAdmin
    .from('bookable_services')
    .update({ contract_template_id: templateId })
    .eq('company_id', companyId)
    .eq('id', servicePackageId)
    .select('id')
    .maybeSingle()

  if (error) throw toMigrationError(error)
  if (!data) throw new ContractTemplateError('Service package not found')
}

/**
 * Template for a new job contract: the template assigned to the service package whose
 * name matches the job title, otherwise the company default.
 */
export async function resolveContractTemplateForSchedule(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  scheduleTitle?: string | null
): Promise<ContractTemplateRecord> {
  const defaultTemplate = await ensureDefaultContractTemplate(supabaseAdmin, companyId)
  const normalizedTitle = scheduleTitle?.trim().toLowerCase()
  if (!normalizedTitle) return defaultTemplate

  const { packages, hasAssignments } = await loadServicePackages(supabaseAdmin, companyId)
  const matchedPackage = packages.find(
    (pkg) => pkg.active && pkg.name?.trim().toLowerCase() === normalizedTitle
  )
  if (!matchedPackage) return defaultTemplate

  if (hasAssignments) {
    if (!matchedPackage.contract_template_id) return defaultTemplate
    const assigned = await loadContractTemplateById(
      supabaseAdmin,
      companyId,
      matchedPackage.contract_template_id
    )
    return assigned ?? defaultTemplate
  }

  const { data: packageTemplate, error: templateError } = await supabaseAdmin
    .from('contract_templates')
    .select('*')
    .eq('company_id', companyId)
    .eq('service_package_id', matchedPackage.id)
    .maybeSingle()

  if (templateError) throw templateError
  if (!packageTemplate) return defaultTemplate

  return normalizeContractTemplateRecord(packageTemplate as ContractTemplateRecord)
}
