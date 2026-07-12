import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildNewContractTemplatePayload,
  getDefaultContractTemplateName,
  getServicePackageContractTemplateName,
  normalizeContractTemplateRecord,
  type ContractTemplateListItem,
  type ContractTemplateRecord,
  type ContractTemplatesPageData,
} from '@/lib/contract-templates'
import { normalizeDocumentTemplate } from '@/lib/document-template'

function toListItem(
  row: ContractTemplateRecord,
  servicePackageName: string | null
): ContractTemplateListItem {
  return {
    id: row.id,
    scope: row.service_package_id ? 'service_package' : 'default',
    name: row.name,
    servicePackageId: row.service_package_id,
    servicePackageName,
    active: row.active,
    updatedAt: row.updated_at,
    usesCatchAll: false,
  }
}

export async function ensureDefaultContractTemplate(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<ContractTemplateRecord> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('contract_templates')
    .select('*')
    .eq('company_id', companyId)
    .is('service_package_id', null)
    .maybeSingle()

  if (existingError && existingError.code !== '42P01') {
    throw existingError
  }

  if (existing) {
    return normalizeContractTemplateRecord(existing as ContractTemplateRecord)
  }

  const payload = buildNewContractTemplatePayload({
    name: getDefaultContractTemplateName(),
  })

  const { data: created, error: createError } = await supabaseAdmin
    .from('contract_templates')
    .insert({
      company_id: companyId,
      service_package_id: null,
      name: payload.name,
      template: payload.template,
      active: true,
    })
    .select('*')
    .single()

  if (createError) throw createError
  return normalizeContractTemplateRecord(created as ContractTemplateRecord)
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

  if (error) throw error
  if (!data) return null
  return normalizeContractTemplateRecord(data as ContractTemplateRecord)
}

export async function loadContractTemplatesPageData(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<ContractTemplatesPageData> {
  const defaultTemplate = await ensureDefaultContractTemplate(supabaseAdmin, companyId)

  const [packagesResult, templatesResult] = await Promise.all([
    supabaseAdmin
      .from('bookable_services')
      .select('id, name, active')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('contract_templates')
      .select('*')
      .eq('company_id', companyId)
      .not('service_package_id', 'is', null)
      .order('updated_at', { ascending: false }),
  ])

  if (packagesResult.error && packagesResult.error.code !== '42P01') {
    throw packagesResult.error
  }
  if (templatesResult.error) throw templatesResult.error

  const packages = packagesResult.data || []
  const packageNameById = new Map(packages.map((pkg) => [pkg.id, pkg.name]))
  const templatesByPackageId = new Map(
    (templatesResult.data || []).map((row) => [
      row.service_package_id as string,
      normalizeContractTemplateRecord(row as ContractTemplateRecord),
    ])
  )

  const packageTemplates: ContractTemplateListItem[] = packages.map((pkg) => {
    const custom = templatesByPackageId.get(pkg.id)
    if (custom) {
      return toListItem(custom, pkg.name)
    }

    return {
      id: `catch-all:${pkg.id}`,
      scope: 'service_package',
      name: getServicePackageContractTemplateName(pkg.name),
      servicePackageId: pkg.id,
      servicePackageName: pkg.name,
      active: pkg.active,
      updatedAt: defaultTemplate.updated_at,
      usesCatchAll: true,
    }
  })

  return {
    defaultTemplate: toListItem(defaultTemplate, null),
    packageTemplates,
    servicePackages: packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      active: pkg.active,
    })),
  }
}

export async function createServicePackageContractTemplate(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  servicePackageId: string,
  packageName: string
): Promise<ContractTemplateRecord> {
  const defaultTemplate = await ensureDefaultContractTemplate(supabaseAdmin, companyId)

  const { data: existing } = await supabaseAdmin
    .from('contract_templates')
    .select('*')
    .eq('company_id', companyId)
    .eq('service_package_id', servicePackageId)
    .maybeSingle()

  if (existing) {
    return normalizeContractTemplateRecord(existing as ContractTemplateRecord)
  }

  const payload = buildNewContractTemplatePayload({
    servicePackageId,
    name: getServicePackageContractTemplateName(packageName),
  })

  const { data: created, error } = await supabaseAdmin
    .from('contract_templates')
    .insert({
      company_id: companyId,
      service_package_id: servicePackageId,
      name: payload.name,
      template: defaultTemplate.template,
      active: true,
    })
    .select('*')
    .single()

  if (error) throw error
  return normalizeContractTemplateRecord(created as ContractTemplateRecord)
}

export async function updateContractTemplateRecord(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  templateId: string,
  patch: {
    name?: string
    template?: unknown
    active?: boolean
  }
): Promise<ContractTemplateRecord> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (patch.name !== undefined) updates.name = patch.name.trim()
  if (patch.template !== undefined) {
    updates.template = normalizeDocumentTemplate(patch.template, 'contract')
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

export async function resetContractTemplateRecord(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  templateId: string
): Promise<ContractTemplateRecord> {
  const payload = buildNewContractTemplatePayload()
  return updateContractTemplateRecord(supabaseAdmin, companyId, templateId, {
    template: payload.template,
  })
}

export async function resolveContractTemplateForSchedule(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  scheduleTitle?: string | null
): Promise<ContractTemplateRecord> {
  const defaultTemplate = await ensureDefaultContractTemplate(supabaseAdmin, companyId)
  const normalizedTitle = scheduleTitle?.trim().toLowerCase()
  if (!normalizedTitle) return defaultTemplate

  const { data: packages, error: packagesError } = await supabaseAdmin
    .from('bookable_services')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('active', true)

  if (packagesError && packagesError.code !== '42P01') {
    throw packagesError
  }

  const matchedPackage = (packages || []).find(
    (pkg) => pkg.name?.trim().toLowerCase() === normalizedTitle
  )
  if (!matchedPackage) return defaultTemplate

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

export async function deleteServicePackageContractTemplate(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  templateId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('contract_templates')
    .delete()
    .eq('company_id', companyId)
    .eq('id', templateId)
    .not('service_package_id', 'is', null)

  if (error) throw error
}