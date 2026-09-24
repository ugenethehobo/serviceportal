'use client'

import { useEffect, useState } from 'react'
import {
  deleteContractAction,
  duplicateContractAction,
  listContractsAction,
  recallContractAction,
  remindContractAction,
  sendContractAction,
  voidContractAction,
} from '@/app/contract-actions'
import { ContractDraftEditorDialog } from '@/components/dashboard/contract-draft-editor-dialog'
import { CreateContractDialog } from '@/components/dashboard/create-contract-dialog'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  canSendContractReminder,
  isDeletableContractStatus,
  isEditableContractStatus,
  isRecallableContractStatus,
  isSendableContractStatus,
  isVoidableContractStatus,
  type ContractSummary,
} from '@/lib/contracts'
import { cn } from '@/lib/utils'
import {
  BellRing,
  Copy,
  Eye,
  FileSignature,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

type ContractsPanelProps = {
  clientId: string
  /** Job scope. Omit to show every contract for the client. */
  scheduleId?: string | null
  onContractChanged?: () => void
  className?: string
}

type ActionResult =
  | { success: true; contract?: ContractSummary }
  | { success: false; error: string }

function statusVariant(status: ContractSummary['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
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

function describeContract(contract: ContractSummary, showJob: boolean) {
  const parts = [contract.number]
  if (showJob && contract.jobTitle) parts.push(contract.jobTitle)
  if (contract.status === 'signed' && contract.signedAt) {
    parts.push(
      `Signed ${new Date(contract.signedAt).toLocaleDateString()}${contract.signedName ? ` by ${contract.signedName}` : ''}`
    )
  } else if (contract.sentAt && contract.status === 'ready_for_signing') {
    parts.push(`Sent ${new Date(contract.sentAt).toLocaleDateString()}`)
  } else {
    parts.push(`Created ${new Date(contract.createdAt).toLocaleDateString()}`)
  }
  return parts.join(' · ')
}

async function openContractPdf(documentId: string | null) {
  if (!documentId) {
    toast.error('The contract PDF is not available yet')
    return
  }
  // Open synchronously so the popup isn't blocked, then point it at the signed URL.
  const popup = window.open('', '_blank')
  try {
    const response = await fetch(`/api/documents/${documentId}/view`)
    const payload = (await response.json()) as { url?: string; error?: string }
    if (!response.ok || !payload.url) throw new Error(payload.error || 'Could not open the PDF')
    if (popup) popup.location.href = payload.url
    else window.location.href = payload.url
  } catch (error) {
    popup?.close()
    toast.error(error instanceof Error ? error.message : 'Could not open the PDF')
  }
}

export function ContractsPanel({ clientId, scheduleId = null, onContractChanged, className }: ContractsPanelProps) {
  const [contracts, setContracts] = useState<ContractSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sendTarget, setSendTarget] = useState<ContractSummary | null>(null)
  const [confirm, setConfirm] = useState<{ contract: ContractSummary; kind: 'void' | 'delete' } | null>(null)

  useEffect(() => {
    let cancelled = false
    void listContractsAction(clientId, scheduleId).then((result) => {
      if (cancelled) return
      if (result.success) setContracts(result.contracts)
      else toast.error(result.error)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [clientId, scheduleId])

  const upsert = (contract: ContractSummary) => {
    setContracts((current) => {
      const exists = current.some((item) => item.id === contract.id)
      return exists
        ? current.map((item) => (item.id === contract.id ? contract : item))
        : [contract, ...current]
    })
  }

  const run = async (
    contract: ContractSummary,
    action: () => Promise<ActionResult>,
    successMessage: string
  ) => {
    setBusyId(contract.id)
    const result = await action()
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error)
      return false
    }
    if (result.contract) upsert(result.contract)
    toast.success(successMessage)
    onContractChanged?.()
    return true
  }

  const copySigningLink = async (contract: ContractSummary) => {
    const url = `${window.location.origin}/portal/contracts/${contract.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Signing link copied. The client signs in to their portal to open it.')
    } catch {
      toast.message(url)
    }
  }

  const showJob = !scheduleId

  return (
    <div className={cn('flex flex-col gap-3 rounded-lg border bg-muted/20 px-4 py-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <FileSignature className="size-4" />
            Contracts
          </p>
          <p className="text-sm text-muted-foreground">
            {scheduleId
              ? 'Agreements for this job. Signed PDFs are saved in the Contracts folder.'
              : 'Every agreement for this client, including job contracts.'}
          </p>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="size-4" />
          New contract
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading contracts…
        </div>
      ) : contracts.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          No contracts yet. Create one from a template or upload a PDF.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {contracts.map((contract) => {
            const busy = busyId === contract.id
            const canRemind = canSendContractReminder(contract.status, contract.reminderSentAt)
            return (
              <li key={contract.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{contract.title}</p>
                    <Badge variant={statusVariant(contract.status)}>{contract.statusLabel}</Badge>
                    {contract.isPdfBased ? <Badge variant="outline">PDF</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{describeContract(contract, showJob)}</p>
                </div>

                <div className="flex items-center gap-1.5">
                  {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
                  {isEditableContractStatus(contract.status) ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditingId(contract.id)}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                  ) : null}
                  {isSendableContractStatus(contract.status) ? (
                    <Button size="sm" disabled={busy} onClick={() => setSendTarget(contract)}>
                      <Send className="size-3.5" />
                      Send
                    </Button>
                  ) : null}
                  {contract.status === 'ready_for_signing' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !canRemind}
                      title={canRemind ? 'Email/text the client again' : 'A reminder was just sent'}
                      onClick={() =>
                        void run(contract, () => remindContractAction(contract.id), 'Reminder sent')
                      }
                    >
                      <BellRing className="size-3.5" />
                      Remind
                    </Button>
                  ) : null}
                  {!isEditableContractStatus(contract.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !contract.documentId}
                      onClick={() => void openContractPdf(contract.documentId)}
                    >
                      <Eye className="size-3.5" />
                      PDF
                    </Button>
                  ) : null}

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                      disabled={busy}
                      aria-label={`More actions for ${contract.title}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isEditableContractStatus(contract.status) ? (
                        <DropdownMenuItem onClick={() => void openContractPdf(contract.documentId)}>
                          <Eye className="size-4" />
                          Preview PDF
                        </DropdownMenuItem>
                      ) : null}
                      {contract.status === 'ready_for_signing' ? (
                        <DropdownMenuItem onClick={() => void copySigningLink(contract)}>
                          <Link2 className="size-4" />
                          Copy signing link
                        </DropdownMenuItem>
                      ) : null}
                      {isRecallableContractStatus(contract.status) ? (
                        <DropdownMenuItem
                          onClick={() =>
                            void run(
                              contract,
                              () => recallContractAction(contract.id),
                              'Contract moved back to draft'
                            )
                          }
                        >
                          <Undo2 className="size-4" />
                          Recall to edit
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        onClick={() =>
                          void run(
                            contract,
                            () => duplicateContractAction(contract.id),
                            'Copied to a new draft'
                          )
                        }
                      >
                        <Copy className="size-4" />
                        Duplicate as draft
                      </DropdownMenuItem>
                      {isVoidableContractStatus(contract.status) || isDeletableContractStatus(contract.status) ? (
                        <DropdownMenuSeparator />
                      ) : null}
                      {isVoidableContractStatus(contract.status) && contract.status !== 'draft' ? (
                        <DropdownMenuItem variant="destructive" onClick={() => setConfirm({ contract, kind: 'void' })}>
                          <XCircle className="size-4" />
                          Void
                        </DropdownMenuItem>
                      ) : null}
                      {isDeletableContractStatus(contract.status) ? (
                        <DropdownMenuItem variant="destructive" onClick={() => setConfirm({ contract, kind: 'delete' })}>
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <CreateContractDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        clientId={clientId}
        scheduleId={scheduleId}
        onCreated={(contract) => {
          setIsCreateOpen(false)
          upsert(contract)
          onContractChanged?.()
          setEditingId(contract.id)
        }}
      />

      <ContractDraftEditorDialog
        contractId={editingId}
        onOpenChange={(open) => {
          if (!open) setEditingId(null)
        }}
        onSaved={(contract) => {
          upsert(contract)
          onContractChanged?.()
        }}
        onRequestSend={(contract) => setSendTarget(contract)}
      />

      <SendContractDialog
        contract={sendTarget}
        onOpenChange={(open) => !open && setSendTarget(null)}
        onSent={(contract) => {
          upsert(contract)
          setSendTarget(null)
          onContractChanged?.()
        }}
      />

      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.kind === 'void' ? 'Void' : 'Delete'} {confirm?.contract.title}?
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === 'void'
                ? 'The client can no longer sign it. The voided PDF stays in the Contracts folder for your records.'
                : 'The contract and its PDF are removed permanently.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={!confirm || busyId === confirm.contract.id}
              onClick={async () => {
                if (!confirm) return
                const { contract, kind } = confirm
                if (kind === 'void') {
                  const ok = await run(contract, () => voidContractAction(contract.id), 'Contract voided')
                  if (ok) setConfirm(null)
                  return
                }
                const ok = await run(contract, () => deleteContractAction(contract.id), 'Contract deleted')
                if (ok) {
                  setContracts((current) => current.filter((item) => item.id !== contract.id))
                  setConfirm(null)
                }
              }}
            >
              {confirm?.kind === 'void' ? 'Void contract' : 'Delete contract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SendContractDialog({
  contract,
  onOpenChange,
  onSent,
}: {
  contract: ContractSummary | null
  onOpenChange: (open: boolean) => void
  onSent: (contract: ContractSummary) => void
}) {
  const [notifyClient, setNotifyClient] = useState(true)
  const [postToMessages, setPostToMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const send = async () => {
    if (!contract) return
    setIsSending(true)
    const result = await sendContractAction(contract.id, { notifyClient, postToMessages })
    setIsSending(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(
      postToMessages && !result.messagePosted
        ? 'Contract sent. It could not be posted to messages.'
        : 'Contract sent to client'
    )
    onSent(result.contract)
  }

  return (
    <Dialog open={!!contract} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send {contract?.title}?</DialogTitle>
          <DialogDescription>
            The client can review and sign it in their portal. The contract locks while it&apos;s out for
            signature; recall it if you need to make changes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label className="flex items-start gap-2 text-sm font-normal">
            <Checkbox checked={notifyClient} onCheckedChange={(checked) => setNotifyClient(checked === true)} />
            <span>
              Email and text the client a signing link
              <span className="block text-xs text-muted-foreground">
                Uses your notification settings. Zapier receives a &ldquo;contract sent&rdquo; event.
              </span>
            </span>
          </Label>
          <Label className="flex items-start gap-2 text-sm font-normal">
            <Checkbox checked={postToMessages} onCheckedChange={(checked) => setPostToMessages(checked === true)} />
            <span>
              Also post the link in client messages
              <span className="block text-xs text-muted-foreground">
                Appears in the {contract?.scheduleId ? 'job' : 'client'} conversation.
              </span>
            </span>
          </Label>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={() => void send()} disabled={isSending}>
            {isSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send contract
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
