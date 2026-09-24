'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getContractTemplateAction,
  replaceContractTemplatePdfAction,
  updateContractTemplateAction,
  updateContractTemplateDetailsAction,
} from '@/app/contract-template-actions'
import { ContractDocumentEditor } from '@/components/dashboard/contract-document-editor'
import { SaveStatusBadge, type SaveStatus } from '@/components/dashboard/save-status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useContractPreview } from '@/hooks/use-contract-preview'
import { useDebouncedCallback } from '@/hooks/use-debounced-callback'
import { normalizeDocumentTemplate, type DocumentTemplate } from '@/lib/document-template'
import { ArrowLeft, FileUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const SAVE_DEBOUNCE_MS = 600

type ContractTemplateEditorProps = {
  templateId: string
  onBack: () => void
}

export function ContractTemplateEditor({ templateId, onBack }: ContractTemplateEditorProps) {
  const [template, setTemplate] = useState<DocumentTemplate | null>(null)
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [isReplacing, setIsReplacing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await getContractTemplateAction(templateId)
      if (cancelled) return
      if (!result.success) {
        toast.error(result.error || 'Failed to load contract template')
      } else {
        setTemplate(result.template.documentTemplate)
        setName(result.template.name)
        setSavedName(result.template.name)
      }
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [templateId])

  const { previewUrl, isLoading: isPreviewLoading, error: previewError } = useContractPreview(
    template ? { kind: 'contract', template, contractTemplateId: templateId } : null
  )

  useEffect(() => {
    if (previewError) toast.error(previewError)
  }, [previewError])

  const debouncedSave = useDebouncedCallback(async (nextTemplate: DocumentTemplate) => {
    setSaveStatus('saving')
    setSaveMessage('')
    const result = await updateContractTemplateAction(templateId, nextTemplate)
    if (!result.success) {
      setSaveStatus('error')
      setSaveMessage(result.error || 'Could not save')
      return
    }
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, SAVE_DEBOUNCE_MS)

  const handleChange = useCallback(
    (nextTemplate: DocumentTemplate) => {
      const normalized = normalizeDocumentTemplate(nextTemplate, 'contract')
      setTemplate(normalized)
      debouncedSave(normalized)
    },
    [debouncedSave]
  )

  const saveName = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === savedName) {
      setName(savedName)
      return
    }
    const result = await updateContractTemplateDetailsAction(templateId, { name: trimmed })
    if (!result.success) {
      toast.error(result.error || 'Could not rename template')
      setName(savedName)
      return
    }
    setSavedName(trimmed)
    toast.success('Template renamed')
  }

  const handleReplacePdf = async (file: File) => {
    setIsReplacing(true)
    const formData = new FormData()
    formData.append('file', file)
    const result = await replaceContractTemplatePdfAction(templateId, formData)
    setIsReplacing(false)
    if (!result.success) {
      toast.error(result.error || 'Could not replace the PDF')
      return
    }
    setTemplate(result.template)
    toast.success('PDF replaced. Check that your fields still line up.')
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading contract template…
      </div>
    )
  }

  if (!template) {
    return (
      <div className="space-y-3">
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back to contract templates
        </Button>
        <p className="text-sm text-muted-foreground">Could not load contract template.</p>
      </div>
    )
  }

  const isPdf = !!template.background

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Back to contract templates
          </Button>
          <Input
            aria-label="Template name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            maxLength={120}
            className="h-9 max-w-md text-lg font-semibold"
          />
          <p className="max-w-3xl text-sm text-muted-foreground">
            {isPdf
              ? `Fields are placed on top of ${template.background?.fileName}. Place client fields where they sign or fill in, and team fields for details you complete on each contract.`
              : 'Write your terms in text blocks and drag in signatures, client fields, and team fields. Merge tags like {{client.name}} fill in automatically.'}
          </p>
        </div>
        <SaveStatusBadge status={saveStatus} message={saveMessage} className="text-sm" />
      </div>

      <ContractDocumentEditor
        template={template}
        onChange={handleChange}
        previewUrl={previewUrl}
        isPreviewLoading={isPreviewLoading}
        toolbarExtras={
          isPdf ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void handleReplacePdf(file)
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isReplacing}
                onClick={() => fileInputRef.current?.click()}
              >
                {isReplacing ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                Replace PDF
              </Button>
            </>
          ) : null
        }
      />
    </div>
  )
}
