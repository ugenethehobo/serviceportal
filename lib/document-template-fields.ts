import type { DocumentKind } from '@/lib/document-template'

export type DocumentFieldDefinition = {
  key: string
  label: string
  kinds: DocumentKind[]
  group: string
}

export const DOCUMENT_FIELD_DEFINITIONS: DocumentFieldDefinition[] = [
  {
    key: 'company.name',
    label: 'Company name',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Company',
  },
  {
    key: 'company.address',
    label: 'Company address',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Company',
  },
  {
    key: 'company.phone',
    label: 'Company phone',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Company',
  },
  {
    key: 'company.logo',
    label: 'Company logo',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Company',
  },
  {
    key: 'document.title',
    label: 'Document title',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Document',
  },
  {
    key: 'document.number',
    label: 'Document number',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Document',
  },
  {
    key: 'document.date',
    label: 'Document date',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Document',
  },
  {
    key: 'bill_to.label',
    label: 'Bill to label',
    kinds: ['invoice', 'estimate'],
    group: 'Client',
  },
  {
    key: 'client.name',
    label: 'Client name',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Client',
  },
  {
    key: 'client.contact_name',
    label: 'Contact name',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Client',
  },
  {
    key: 'client.address',
    label: 'Client address',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Client',
  },
  {
    key: 'client.email',
    label: 'Client email',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Client',
  },
  {
    key: 'client.phone',
    label: 'Client phone',
    kinds: ['invoice', 'estimate', 'contract'],
    group: 'Client',
  },
  { key: 'job.title', label: 'Job title', kinds: ['invoice', 'contract'], group: 'Job' },
  { key: 'job.visit_date', label: 'Visit date', kinds: ['invoice', 'contract'], group: 'Job' },
  {
    key: 'estimate.title',
    label: 'Estimate title',
    kinds: ['estimate'],
    group: 'Estimate',
  },
  {
    key: 'estimate.description',
    label: 'Estimate description',
    kinds: ['estimate'],
    group: 'Estimate',
  },
  {
    key: 'table.line_items',
    label: 'Line items table',
    kinds: ['invoice', 'estimate'],
    group: 'Line items',
  },
  {
    key: 'payments.section',
    label: 'Payments',
    kinds: ['invoice'],
    group: 'Totals',
  },
  {
    key: 'summary.totals',
    label: 'Invoice totals',
    kinds: ['invoice'],
    group: 'Totals',
  },
  {
    key: 'summary.total',
    label: 'Estimate total',
    kinds: ['estimate'],
    group: 'Totals',
  },
  { key: 'footer.text', label: 'Footer note', kinds: ['invoice', 'estimate', 'contract'], group: 'Footer' },
  {
    key: 'service.name',
    label: 'Service package name',
    kinds: ['contract'],
    group: 'Service',
  },
  {
    key: 'contract.signed_date',
    label: 'Signed date',
    kinds: ['contract'],
    group: 'Contract',
  },
  {
    key: 'sign.client',
    label: 'Client signature',
    kinds: ['contract'],
    group: 'Signing',
  },
  {
    key: 'sign.client.initials',
    label: 'Client initials',
    kinds: ['contract'],
    group: 'Signing',
  },
]

export const CONTRACT_INPUT_FIELD_PREFIX = 'input.'

export function isContractInputFieldKey(fieldKey: string | undefined): boolean {
  return !!fieldKey?.startsWith(CONTRACT_INPUT_FIELD_PREFIX)
}

export function buildContractInputFieldKey(id: string): string {
  return `${CONTRACT_INPUT_FIELD_PREFIX}${id}`
}

export function getDocumentFieldsForKind(kind: DocumentKind) {
  return DOCUMENT_FIELD_DEFINITIONS.filter((field) => field.kinds.includes(kind))
}

export function getDocumentFieldPlaceholderLabel(fieldKey: string, fallback?: string): string {
  const definition = DOCUMENT_FIELD_DEFINITIONS.find((field) => field.key === fieldKey)
  const label = definition?.label ?? fallback ?? fieldKey
  return label.replace(/\b\w/g, (char) => char.toUpperCase())
}