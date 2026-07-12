import {
  DEFAULT_CONTRACT_DOCUMENT_TEMPLATE,
  normalizeDocumentTemplate,
  type DocumentTemplate,
} from '@/lib/document-template'

export type ContractTemplateScope = 'default' | 'service_package'

export type ContractTemplateRecord = {
  id: string
  company_id: string
  service_package_id: string | null
  name: string
  template: DocumentTemplate
  active: boolean
  created_at: string
  updated_at: string
}

export type ContractTemplateListItem = {
  id: string
  scope: ContractTemplateScope
  name: string
  servicePackageId: string | null
  servicePackageName: string | null
  active: boolean
  updatedAt: string
  usesCatchAll: boolean
}

export type ContractTemplatesPageData = {
  defaultTemplate: ContractTemplateListItem
  packageTemplates: ContractTemplateListItem[]
  servicePackages: Array<{
    id: string
    name: string
    active: boolean
  }>
}

export function normalizeContractTemplateRecord(
  row: Partial<ContractTemplateRecord> & { id: string; company_id: string }
): ContractTemplateRecord {
  return {
    id: row.id,
    company_id: row.company_id,
    service_package_id: row.service_package_id ?? null,
    name: row.name?.trim() || 'Contract template',
    template: normalizeDocumentTemplate(row.template, 'contract'),
    active: row.active !== false,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  }
}

export function getDefaultContractTemplateName() {
  return 'Default contract (catch-all)'
}

export function getServicePackageContractTemplateName(packageName: string) {
  return `${packageName} contract`
}

export function buildNewContractTemplatePayload(input?: {
  servicePackageId?: string | null
  name?: string
}): {
  service_package_id: string | null
  name: string
  template: DocumentTemplate
} {
  return {
    service_package_id: input?.servicePackageId ?? null,
    name: input?.name?.trim() || getDefaultContractTemplateName(),
    template: normalizeDocumentTemplate(DEFAULT_CONTRACT_DOCUMENT_TEMPLATE, 'contract'),
  }
}