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
  /** v2: the layout frozen onto this contract (null for v1 contracts). */
  template_snapshot?: unknown
  client_signed_ip?: string | null
  client_signed_user_agent?: string | null
  reminder_sent_at?: string | null
}

/** Staff-facing contract row used by the job and client contract panels. */
export type ContractSummary = {
  id: string
  number: string
  title: string
  status: ContractStatus
  statusLabel: string
  scheduleId: string | null
  jobTitle: string | null
  sentAt: string | null
  signedAt: string | null
  signedName: string | null
  createdAt: string
  reminderSentAt: string | null
  documentId: string | null
  isPdfBased: boolean
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

export function isEditableContractStatus(status: ContractStatus): boolean {
  return status === 'draft'
}

export function isRecallableContractStatus(status: ContractStatus): boolean {
  return status === 'ready_for_signing' || status === 'sent'
}

export function isRemindableContractStatus(status: ContractStatus): boolean {
  return status === 'ready_for_signing'
}

export function isDeletableContractStatus(status: ContractStatus): boolean {
  return status === 'draft' || status === 'void'
}

/** Draft contracts are internal until they are sent. */
export function isContractVisibleToClient(status: ContractStatus | null | undefined): boolean {
  return status !== 'draft'
}

export const CONTRACT_REMINDER_COOLDOWN_MS = 10 * 60 * 1000

export function canSendContractReminder(
  status: ContractStatus,
  reminderSentAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!isRemindableContractStatus(status)) return false
  if (!reminderSentAt) return true
  return now.getTime() - new Date(reminderSentAt).getTime() >= CONTRACT_REMINDER_COOLDOWN_MS
}
