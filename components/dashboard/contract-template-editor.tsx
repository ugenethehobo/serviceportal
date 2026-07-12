'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getContractTemplateAction,
  resetContractTemplateAction,
  updateContractTemplateAction,
} from '@/app/contract-template-actions'
import { DocumentTemplateWorkspace } from '@/components/dashboard/document-template-workspace'
import { SaveStatusBadge, type SaveStatus } from '@/components/dashboard/save-status-badge'
import { Button } from '@/components/ui/button'
import { useDebouncedCallback } from '@/hooks/use-debounced-callback'
import type { DocumentTemplate } from '@/lib/document-template'
import { normalizeDocumentTemplate } from '@/lib/document-template'
import { updateTemplateElement } from '@/lib/document-template-editor-utils'
import { buildContractInputFieldKey } from '@/lib/document-template-fields'
import { ArrowLeft, Loader2, PenLine, RotateCcw, Signature, TextCursorInput } from 'lucide-react'
import { toast } from 'sonner'

const SAVE_DEBOUNCE_MS = 600
const PREVIEW_DEBOUNCE_MS = 450

async function fetchContractTemplatePreview(template: DocumentTemplate) {
  const response = await fetch('/api/document-templates/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'contract', template }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || 'Failed to render preview')
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

type ContractTemplateEditorProps = {
  templateId: string
  templateLabel: string
  usesCatchAll?: boolean
  onBack: () => void
}

export function ContractTemplateEditor({
  templateId,
  templateLabel,
  usesCatchAll = false,
  onBack,
}: ContractTemplateEditorProps) {
  const [template, setTemplate] = useState<DocumentTemplate | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const previewUrlRef = useRef<string | null>(null)

  const loadTemplate = useCallback(async () => {
    setIsLoading(true)
    const result = await getContractTemplateAction(templateId)
    if (!result.success) {
      toast.error(result.error || 'Failed to load contract template')
      setIsLoading(false)
      return
    }

    setTemplate(result.template.documentTemplate)
    setIsLoading(false)
  }, [templateId])

  useEffect(() => {
    void loadTemplate()
  }, [loadTemplate])

  const refreshPreview = useCallback(async (nextTemplate: DocumentTemplate) => {
    setIsPreviewLoading(true)
    try {
      const nextUrl = await fetchContractTemplatePreview(nextTemplate)
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
      previewUrlRef.current = nextUrl
      setPreviewUrl(nextUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to render preview'
      toast.error(message)
    } finally {
      setIsPreviewLoading(false)
    }
  }, [])

  const debouncedRefreshPreview = useDebouncedCallback((nextTemplate: DocumentTemplate) => {
    void refreshPreview(nextTemplate)
  }, PREVIEW_DEBOUNCE_MS)

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

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!template) return
    debouncedRefreshPreview(template)
  }, [template, debouncedRefreshPreview])

  const updateTemplate = useCallback(
    (nextTemplate: DocumentTemplate) => {
      const normalized = normalizeDocumentTemplate(nextTemplate, 'contract')
      setTemplate(normalized)
      debouncedSave(normalized)
    },
    [debouncedSave]
  )

  const selectedElement = useMemo(
    () => template?.elements.find((element) => element.id === selectedElementId) || null,
    [template, selectedElementId]
  )

  const addElement = useCallback(
    (kind: 'signature' | 'initial' | 'input' | 'text') => {
      if (!template) return

      const id = `${kind}-${Date.now()}`
      const base = {
        id,
        x: 50,
        y: 560,
        visible: true,
        layout: 'absolute' as const,
        fontSize: 10,
      }

      let element
      if (kind === 'signature') {
        element = {
          ...base,
          kind: 'signature' as const,
          fieldKey: 'sign.client',
          label: 'Client signature',
          width: 260,
          height: 72,
        }
      } else if (kind === 'initial') {
        element = {
          ...base,
          kind: 'initial' as const,
          fieldKey: 'sign.client.initials',
          label: 'Client initials',
          width: 120,
          height: 48,
        }
      } else if (kind === 'input') {
        element = {
          ...base,
          kind: 'input' as const,
          fieldKey: buildContractInputFieldKey(id),
          label: 'Text field',
          width: 260,
          height: 48,
        }
      } else {
        element = {
          ...base,
          kind: 'text' as const,
          text: 'Additional clause or terms',
          width: 512,
          layout: 'flow' as const,
          y: 400,
        }
      }

      updateTemplate({
        ...template,
        preset: 'custom',
        elements: [...template.elements, element],
      })
      setSelectedElementId(id)
    },
    [template, updateTemplate]
  )

  const handleReset = useCallback(async () => {
    setIsResetting(true)
    setSaveStatus('saving')
    try {
      const result = await resetContractTemplateAction(templateId)
      if (!result.success) {
        toast.error(result.error || 'Failed to reset template')
        setSaveStatus('error')
        setSaveMessage(result.error || 'Could not reset')
        return
      }

      setTemplate(result.template)
      setSelectedElementId(null)
      setSaveStatus('saved')
      toast.success('Contract template reset')
      setTimeout(() => setSaveStatus('idle'), 2000)
      void refreshPreview(result.template)
    } finally {
      setIsResetting(false)
    }
  }, [refreshPreview, templateId])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading contract template…
      </div>
    )
  }

  if (!template) {
    return <p className="text-sm text-muted-foreground">Could not load contract template.</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Back to contract templates
          </Button>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{templateLabel}</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Design the contract PDF your clients will sign. Drag merge fields, signature boxes,
              initials, and fillable text inputs into place.
              {usesCatchAll ? ' This package currently inherits the catch-all template.' : ''}
            </p>
          </div>
        </div>
        <SaveStatusBadge status={saveStatus} message={saveMessage} className="text-sm" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => addElement('text')}>
          <PenLine className="size-4" />
          Add text block
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addElement('input')}>
          <TextCursorInput className="size-4" />
          Add text field
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addElement('signature')}>
          <Signature className="size-4" />
          Add signature
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addElement('initial')}>
          <PenLine className="size-4" />
          Add initials
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleReset()}
          disabled={isResetting}
        >
          <RotateCcw className="size-4" />
          Reset layout
        </Button>
      </div>

      <DocumentTemplateWorkspace
        kind="contract"
        template={template}
        previewUrl={previewUrl}
        isPreviewLoading={isPreviewLoading}
        isActiveKind
        selectedElementId={selectedElementId}
        selectedElement={selectedElement}
        onSelectElement={setSelectedElementId}
        onMoveElement={(elementId, x, y) =>
          updateTemplate({
            ...updateTemplateElement(template, elementId, { x, y }),
            preset: 'custom',
          })
        }
        onResizeElement={(elementId, patch) =>
          updateTemplate({
            ...updateTemplateElement(template, elementId, patch),
            preset: 'custom',
          })
        }
        onToggleVisibility={(elementId, visible) =>
          updateTemplate({
            ...updateTemplateElement(template, elementId, { visible }),
            preset: 'custom',
          })
        }
        onUpdateTemplate={updateTemplate}
        onUpdateElement={(elementId, patch) =>
          updateTemplate({
            ...updateTemplateElement(template, elementId, patch),
            preset: 'custom',
          })
        }
      />
    </div>
  )
}