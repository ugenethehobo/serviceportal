export const CONTRACT_STATUSES = [
  'draft',
  'sent',
  'ready_for_signing',
  'signed',
  'void',
] as const

export type ContractStatus = (typeof CONTRACT_STATUSES)[number]

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  ready_for_signing: 'Ready for signing',
  signed: 'Signed',
  void: 'Void',
}

export function isContractStatus(value: string): value is ContractStatus {
  return (CONTRACT_STATUSES as readonly string[]).includes(value)
}

export function formatContractStatus(status: ContractStatus): string {
  return CONTRACT_STATUS_LABELS[status] ?? status
}

export type ContractRecord = {
  id: string
  company_id: string
  client_id: string
  schedule_id: string | null
  contract_template_id: string | null
  status: ContractStatus
  title: string
  field_values: Record<string, string>
  client_signature_storage_path: string | null
  client_initials_storage_path: string | null
  client_signed_at: string | null
  client_signed_name: string | null
  sent_at: string | null
  storage_path: string | null
  created_at: string
  updated_at: string
}

export function formatContractNumber(contractId: string, createdAt?: string | null): string {
  const issuedAt = createdAt ? new Date(createdAt) : new Date()
  const stamp = issuedAt.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = contractId.replace(/-/g, '').slice(0, 6).toUpperCase()
  return `CTR-${stamp}-${suffix}`
}

export function isActiveContractStatus(status: ContractStatus): boolean {
  return status !== 'void'
}

export function isSendableContractStatus(status: ContractStatus): boolean {
  return status === 'draft' || status === 'sent'
}

export function isVoidableContractStatus(status: ContractStatus): boolean {
  return isActiveContractStatus(status) && status !== 'signed'
}

export function isSignableContractStatus(status: ContractStatus): boolean {
  return status === 'ready_for_signing'
}