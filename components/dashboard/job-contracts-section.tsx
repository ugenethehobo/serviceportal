'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  createJobContractAction,
  getJobContractAction,
  sendJobContractAction,
  voidJobContractAction,
  type JobContractSummary,
} from '@/app/contract-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isSendableContractStatus, isVoidableContractStatus } from '@/lib/contracts'
import { toast } from 'sonner'
import { FileSignature, Loader2, Send, XCircle } from 'lucide-react'

interface JobContractsSectionProps {
  scheduleId: string
  clientId: string
  onContractChanged?: () => void
}

function contractStatusVariant(
  status: JobContractSummary['status']
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'signed':
      return 'default'
    case 'ready_for_signing':
    case 'sent':
      return 'secondary'
    case 'void':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function JobContractsSection({
  scheduleId,
  clientId,
  onContractChanged,
}: JobContractsSectionProps) {
  const [contract, setContract] = useState<JobContractSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isVoiding, setIsVoiding] = useState(false)

  const fetchContract = useCallback(async () => {
    const result = await getJobContractAction(scheduleId, clientId)
    if (result.success) {
      setContract(result.contract)
    } else {
      toast.error(result.error || 'Failed to load contract')
    }
    setIsLoading(false)
  }, [scheduleId, clientId])

  useEffect(() => {
    setIsLoading(true)
    void fetchContract()
  }, [fetchContract])

  const handleCreate = async () => {
    setIsCreating(true)
    const result = await createJobContractAction(scheduleId, clientId)
    if (result.success) {
      setContract(result.contract)
      toast.success('Contract created')
      onContractChanged?.()
    } else {
      toast.error(result.error || 'Failed to create contract')
    }
    setIsCreating(false)
  }

  const handleSend = async () => {
    if (!contract) return
    setIsSending(true)
    const result = await sendJobContractAction(contract.id, scheduleId, clientId)
    if (result.success) {
      setContract(result.contract)
      toast.success('Contract sent to client')
      onContractChanged?.()
    } else {
      toast.error(result.error || 'Failed to send contract')
    }
    setIsSending(false)
  }

  const handleVoid = async () => {
    if (!contract) return
    setIsVoiding(true)
    const result = await voidJobContractAction(contract.id, scheduleId, clientId)
    if (result.success) {
      setContract(null)
      toast.success('Contract voided')
      onContractChanged?.()
    } else {
      toast.error(result.error || 'Failed to void contract')
    }
    setIsVoiding(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading contract…
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Service contract</p>
          <p className="text-sm text-muted-foreground">
            Create a contract from your template. It will appear under Contracts in job documents.
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isCreating}>
          {isCreating ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <FileSignature className="mr-2 size-4" />
          )}
          Create contract
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 px-4 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{contract.title}</p>
            <Badge variant={contractStatusVariant(contract.status)}>
              {contract.statusLabel}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {contract.number}
            {contract.sentAt
              ? ` · Sent ${new Date(contract.sentAt).toLocaleString()}`
              : ` · Created ${new Date(contract.createdAt).toLocaleString()}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSendableContractStatus(contract.status) && (
            <Button size="sm" onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Send className="mr-2 size-4" />
              )}
              Send to client
            </Button>
          )}
          {isVoidableContractStatus(contract.status) && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleVoid}
              disabled={isVoiding}
            >
              {isVoiding ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 size-4" />
              )}
              Void
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        The contract PDF is listed under the Contracts folder below.
        {contract.status === 'ready_for_signing'
          ? ' The client can view it in their portal documents.'
          : null}
      </p>
    </div>
  )
}