'use client'

import { ContractsPanel } from '@/components/dashboard/contracts-panel'

interface JobContractsSectionProps {
  scheduleId: string
  clientId: string
  onContractChanged?: () => void
}

export function JobContractsSection({ scheduleId, clientId, onContractChanged }: JobContractsSectionProps) {
  return <ContractsPanel clientId={clientId} scheduleId={scheduleId} onContractChanged={onContractChanged} />
}
