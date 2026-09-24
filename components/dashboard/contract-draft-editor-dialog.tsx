'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  finalizeContractDraftAction,
  getContractEditorAction,
  updateContractDraftAction,
} from '@/app/contract-actions'
import { ContractDocumentEditor } from '@/components/dashboard/contract-document-editor'
import { SaveStatusBadge, type SaveStatus } from '@/components/dashboard/save-status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useContractPreview } from '@/hooks/use-contract-preview'
import { useDebouncedCallback } from '@/hooks/use-debounced-callback'
import { extractContractStaffFields } from '@/lib/contract-signing'
import type { ContractSummary } from '@/lib/contracts'
import { normalizeDocumentTemplate, type DocumentTemplate } from '@/lib/document-template'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

const SAVE_DEBOUNCE_MS = 600

type PendingSave = {
  title?: string
  template?: DocumentTemplate
  fieldValues?: Record<string, string>
}

type ContractDraftEditorDialogProps = {
  contractId: string | null
  onOpenChange: (open: boolean) => void
  /** Called after closing with the refreshed contract. */
  onSaved: (contract: ContractSummary) => void
  onRequestSend: (contract: ContractSummary) => void
}

export function ContractDraftEditorDialog({
  contractId,
  onOpenChange,
  onSaved,
  onRequestSend,
}: ContractDraftEditorDialogProps) {
  return (
    <Dialog open={!!contractId} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[96vh] max-h-[96vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(98vw,1400px)]"
      >
        {contractId ? (
          <ContractDraftEditorBody
            key={contractId}
            contractId={contractId}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
            onRequestSend={onRequestSend}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ContractDraftEditorBody({
  contractId,
  onClose,
  onSaved,
  onRequestSend,
}: {
  contractId: string
  onClose: () => void
  onSaved: (contract: ContractSummary) => void
  onRequestSend: (contract: ContractSummary) => void
}) {
  const [summary, setSummary] = useState<ContractSummary | null>(null)
  const [template, setTemplate] = useState<DocumentTemplate | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [title, setTitle] = useState('')
  const [editable, setEditable] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isClosing, setIsClosing] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const pendingRef = useRef<PendingSave>({})
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await getContractEditorAction(contractId)
      if (cancelled) return
      if (!result.success) {
        toast.error(result.error)
        onCloseRef.current()
        return
      }
      setSummary(result.data.summary)
      setTemplate(result.data.template)
      setFieldValues(result.data.fieldValues)
      setTitle(result.data.summary.title)
      setEditable(result.data.editable && result.data.snapshotsEnabled)
      if (result.data.editable && !result.data.snapshotsEnabled) {
        toast.message('Run supabase/contracts-v2-schema.sql to edit individual contracts.')
      }
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [contractId])

  const staffFields = useMemo(
    () => (template ? extractContractStaffFields(template) : []),
    [template]
  )

  const { previewUrl, isLoading: isPreviewLoading, error: previewError } = useContractPreview(
    template ? { kind: 'contract', contractId, template, fieldValues } : null
  )

  useEffect(() => {
    if (previewError) toast.error(previewError)
  }, [previewError])

  const persist = useCallback(
    async (patch: PendingSave) => {
      if (Object.keys(patch).length === 0) return true
      setSaveStatus('saving')
      setSaveMessage('')
      const result = await updateContractDraftAction(contractId, patch)
      if (!result.success) {
        setSaveStatus('error')
        setSaveMessage(result.error)
        return false
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
      return true
    },
    [contractId]
  )

  const debouncedPersist = useDebouncedCallback(() => {
    const patch = pendingRef.current
    pendingRef.current = {}
    void persist(patch)
  }, SAVE_DEBOUNCE_MS)

  const queueSave = (patch: PendingSave) => {
    pendingRef.current = { ...pendingRef.current, ...patch }
    debouncedPersist()
  }

  const handleTemplateChange = (next: DocumentTemplate) => {
    const normalized = normalizeDocumentTemplate(next, 'contract')
    setTemplate(normalized)
    queueSave({ template: normalized })
  }

  const handleFieldChange = (key: string, value: string) => {
    const next = { ...fieldValues, [key]: value }
    setFieldValues(next)
    queueSave({ fieldValues: next })
  }

  const finish = async (thenSend: boolean) => {
    setIsClosing(true)
    try {
      // Flush anything still waiting on the debounce before re-rendering the PDF.
      if (editable) {
        pendingRef.current = {}
        const saved = await persist({
          title: title.trim() || summary?.title,
          template: template ?? undefined,
          fieldValues,
        })
        if (!saved) return
      }
      const result = await finalizeContractDraftAction(contractId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      onSaved(result.contract)
      onClose()
      if (thenSend) onRequestSend(result.contract)
    } finally {
      setIsClosing(false)
    }
  }

  const missingRequired = staffFields.filter(
    (field) => field.required && !fieldValues[field.key]?.trim()
  )

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <DialogTitle className="sr-only">Edit contract</DialogTitle>
          <DialogDescription className="sr-only">
            Fill in contract details, adjust the layout, and preview the PDF.
          </DialogDescription>
          {isLoading ? (
            <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Contract title"
                value={title}
                disabled={!editable}
                maxLength={160}
                onChange={(event) => {
                  setTitle(event.target.value)
                  if (event.target.value.trim()) queueSave({ title: event.target.value })
                }}
                className="h-8 max-w-md text-base font-semibold"
              />
              {summary ? <Badge variant="outline">{summary.statusLabel}</Badge> : null}
              {summary ? (
                <span className="text-xs text-muted-foreground">{summary.number}</span>
              ) : null}
            </div>
          )}
        </div>
        <SaveStatusBadge status={saveStatus} message={saveMessage} />
        <Button type="button" variant="outline" size="sm" disabled={isClosing} onClick={() => void finish(false)}>
          {isClosing ? <Loader2 className="size-4 animate-spin" /> : null}
          {editable ? 'Save & close' : 'Close'}
        </Button>
        {editable ? (
          <Button
            type="button"
            size="sm"
            disabled={isClosing || isLoading || missingRequired.length > 0}
            title={missingRequired.length ? `Fill in: ${missingRequired.map((field) => field.label).join(', ')}` : undefined}
            onClick={() => void finish(true)}
          >
            <Send className="size-4" />
            Review & send
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading || !template ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading contract…
          </div>
        ) : (
          <div className="space-y-4">
            {staffFields.length > 0 ? (
              <Card className="space-y-3 p-4">
                <div>
                  <p className="text-sm font-medium">Details for this contract</p>
                  <p className="text-xs text-muted-foreground">
                    These team fields print on the PDF. The client can&apos;t change them.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {staffFields.map((field) => (
                    <div key={field.key} className={field.multiline ? 'space-y-1.5 md:col-span-2' : 'space-y-1.5'}>
                      <Label htmlFor={`staff-${field.key}`}>
                        {field.label}
                        {field.required ? <span className="text-destructive"> *</span> : null}
                      </Label>
                      {field.multiline ? (
                        <Textarea
                          id={`staff-${field.key}`}
                          value={fieldValues[field.key] || ''}
                          disabled={!editable}
                          rows={3}
                          maxLength={2000}
                          onChange={(event) => handleFieldChange(field.key, event.target.value)}
                        />
                      ) : (
                        <Input
                          id={`staff-${field.key}`}
                          value={fieldValues[field.key] || ''}
                          disabled={!editable}
                          maxLength={2000}
                          onChange={(event) => handleFieldChange(field.key, event.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            <ContractDocumentEditor
              template={template}
              onChange={handleTemplateChange}
              previewUrl={previewUrl}
              isPreviewLoading={isPreviewLoading}
              readOnly={!editable}
            />
          </div>
        )}
      </div>
    </>
  )
}
