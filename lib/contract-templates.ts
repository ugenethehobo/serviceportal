import { extractContractSigningRequirements, extractContractStaffFields } from '@/lib/contract-signing'
import { getContractStarter, type ContractStarterId } from '@/lib/contract-template-library'
import {
  getDocumentPageCount,
  normalizeDocumentTemplate,
  type DocumentTemplate,
} from '@/lib/document-template'

export type ContractTemplateSourceType = 'builder' | 'pdf'

export type ContractTemplateRecord = {
  id: string
  company_id: string
  /** Legacy v1 package ownership; v2 assigns templates on bookable_services instead. */
  service_package_id: string | null
  name: string
  description: string | null
  template: DocumentTemplate
  active: boolean
  is_default: boolean
  source_type: ContractTemplateSourceType
  created_at: string
  updated_at: string
}

export type ContractTemplateFieldSummary = {
  pageCount: number
  signatures: number
  clientFields: number
  staffFields: number
}

export type ContractTemplateListItem = {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  sourceType: ContractTemplateSourceType
  fileName: string | null
  servicePackageNames: string[]
  updatedAt: string
  summary: ContractTemplateFieldSummary
}

export type ContractTemplateServicePackage = {
  id: string
  name: string
  active: boolean
  templateId: string | null
}

export type ContractTemplatesPageData = {
  templates: ContractTemplateListItem[]
  defaultTemplateId: string
  servicePackages: ContractTemplateServicePackage[]
  /** False until supabase/contracts-v2-schema.sql has been run. */
  libraryEnabled: boolean
}

/** Picker option when creating a contract. */
export type ContractTemplateOption = {
  id: string
  name: string
  isDefault: boolean
  sourceType: ContractTemplateSourceType
  pageCount: number
  staffFieldCount: number
}

export const DEFAULT_NEW_COMPANY_STARTER: ContractStarterId = 'service-agreement'

export function normalizeContractTemplateRecord(
  row: Partial<ContractTemplateRecord> & { id: string; company_id: string }
): ContractTemplateRecord {
  const template = normalizeDocumentTemplate(row.template, 'contract')
  return {
    id: row.id,
    company_id: row.company_id,
    service_package_id: row.service_package_id ?? null,
    name: row.name?.trim() || 'Contract template',
    description: row.description?.trim() || null,
    template,
    active: row.active !== false,
    is_default: row.is_default === true,
    source_type: row.source_type === 'pdf' || template.background ? 'pdf' : 'builder',
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  }
}

export function summarizeContractTemplate(template: DocumentTemplate): ContractTemplateFieldSummary {
  const requirements = extractContractSigningRequirements(template)
  const signatures = template.elements.filter(
    (element) => element.visible && (element.kind === 'signature' || element.kind === 'initial')
  ).length
  return {
    pageCount: getDocumentPageCount(template),
    signatures,
    clientFields: requirements.inputFields.length + requirements.checkboxFields.length,
    staffFields: extractContractStaffFields(template).length,
  }
}

export function toContractTemplateListItem(
  record: ContractTemplateRecord,
  servicePackageNames: string[] = []
): ContractTemplateListItem {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    isDefault: record.is_default,
    sourceType: record.source_type,
    fileName: record.template.background?.fileName ?? null,
    servicePackageNames,
    updatedAt: record.updated_at,
    summary: summarizeContractTemplate(record.template),
  }
}

export function toContractTemplateOption(record: ContractTemplateRecord): ContractTemplateOption {
  const summary = summarizeContractTemplate(record.template)
  return {
    id: record.id,
    name: record.name,
    isDefault: record.is_default,
    sourceType: record.source_type,
    pageCount: summary.pageCount,
    staffFieldCount: summary.staffFields,
  }
}

/**
 * Picks the company default. v2 rows carry `is_default`; before the v2 migration the
 * single template without a service package was the catch-all.
 */
export function pickDefaultContractTemplate(
  records: ContractTemplateRecord[]
): ContractTemplateRecord | null {
  const flagged = records.find((record) => record.is_default)
  if (flagged) return flagged
  const legacy = records
    .filter((record) => !record.service_package_id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return legacy[0] ?? null
}

export function getDefaultContractTemplateName() {
  return 'Service agreement'
}

export function buildNewContractTemplatePayload(input?: {
  servicePackageId?: string | null
  name?: string
  starterId?: ContractStarterId
}): {
  service_package_id: string | null
  name: string
  template: DocumentTemplate
} {
  const starter = getContractStarter(input?.starterId ?? DEFAULT_NEW_COMPANY_STARTER)
  return {
    service_package_id: input?.servicePackageId ?? null,
    name: input?.name?.trim() || starter?.name || getDefaultContractTemplateName(),
    template: normalizeDocumentTemplate(starter?.build() ?? null, 'contract'),
  }
}

export function contractTemplateNameOrFallback(name: string | null | undefined, fallback: string) {
  const trimmed = name?.trim().slice(0, 120)
  return trimmed || fallback
}

/**
 * Starting layout for an uploaded PDF: the PDF pages plus a client signature tag near the
 * bottom of the last page, ready to be dragged onto the document's own signature line.
 */
export function buildPdfContractTemplate(input: {
  storagePath: string
  fileName: string
  pageSizes: Array<{ width: number; height: number }>
  elements?: DocumentTemplate['elements']
}): DocumentTemplate {
  const pageSizes = input.pageSizes.length ? input.pageSizes : [{ width: 612, height: 792 }]
  const lastPage = pageSizes.length - 1
  const last = pageSizes[lastPage]
  const elements = input.elements ?? [
    {
      id: 'client-signature',
      kind: 'signature' as const,
      fieldKey: 'sign.client',
      label: 'Client signature',
      appearance: 'overlay' as const,
      x: 50,
      y: Math.max(0, last.height - 130),
      width: 220,
      height: 48,
      fontSize: 10,
      page: lastPage > 0 ? lastPage : undefined,
      visible: true,
      layout: 'absolute' as const,
    },
  ]

  return normalizeDocumentTemplate(
    {
      version: 2,
      page: { ...pageSizes[0] },
      pages: pageSizes.map((size) => ({ ...size })),
      preset: 'custom',
      footerDueText: '',
      background: {
        kind: 'pdf',
        storagePath: input.storagePath,
        fileName: input.fileName,
        pageCount: pageSizes.length,
      },
      elements,
    },
    'contract'
  )
}
