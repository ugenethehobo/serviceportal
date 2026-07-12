'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  copyInvoiceLayoutToEstimateAction,
  getDocumentTemplatesAction,
  resetDocumentTemplateAction,
  updateDocumentTemplateAction,
} from '@/app/action'
import { DocumentTemplateToolbar } from '@/components/dashboard/document-template-toolbar'
import { DocumentTemplateWorkspace } from '@/components/dashboard/document-template-workspace'
import { SaveStatusBadge, type SaveStatus } from '@/components/dashboard/save-status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebouncedCallback } from '@/hooks/use-debounced-callback'
import type {
  CompanyDocumentTemplates,
  DocumentTemplate,
  InvoiceEstimateDocumentKind,
} from '@/lib/document-template'
import { normalizeDocumentTemplate } from '@/lib/document-template'
import { updateTemplateElement } from '@/lib/document-template-editor-utils'
import {
  applyTemplateLayoutPreset,
  type TemplateLayoutPreset,
} from '@/lib/document-template-presets'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'

const SAVE_DEBOUNCE_MS = 600
const PREVIEW_DEBOUNCE_MS = 450

async function fetchTemplatePreview(kind: InvoiceEstimateDocumentKind, template: DocumentTemplate) {
  const response = await fetch('/api/document-templates/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, template }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || 'Failed to render preview')
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

export function DocumentTemplateEditor() {
  const [templates, setTemplates] = useState<CompanyDocumentTemplates | null>(null)
  const [activeKind, setActiveKind] = useState<InvoiceEstimateDocumentKind>('invoice')
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isToolbarBusy, setIsToolbarBusy] = useState(false)
  const previewUrlRef = useRef<string | null>(null)
  const hasLoadedRef = useRef(false)


  const activeTemplate = templates?.[activeKind] ?? null

  const loadTemplates = useCallback(async () => {
    const result = await getDocumentTemplatesAction()
    if (!result.success) {
      toast.error(result.error || 'Failed to load document templates')
      setIsLoading(false)
      return
    }

    setTemplates(result.templates)
    setIsLoading(false)
    hasLoadedRef.current = true
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const refreshPreview = useCallback(async (kind: InvoiceEstimateDocumentKind, template: DocumentTemplate) => {
    setIsPreviewLoading(true)
    try {
      const nextUrl = await fetchTemplatePreview(kind, template)
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

  const debouncedRefreshPreview = useDebouncedCallback(
    (kind: InvoiceEstimateDocumentKind, template: DocumentTemplate) => {
      void refreshPreview(kind, template)
    },
    PREVIEW_DEBOUNCE_MS
  )

  const debouncedSave = useDebouncedCallback(
    async (kind: InvoiceEstimateDocumentKind, template: DocumentTemplate) => {
      setSaveStatus('saving')
      setSaveMessage('')

      const result = await updateDocumentTemplateAction(kind, template)
      if (!result.success) {
        setSaveStatus('error')
        setSaveMessage(result.error || 'Could not save')
        return
      }

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    },
    SAVE_DEBOUNCE_MS
  )

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!activeTemplate || !hasLoadedRef.current) return
    debouncedRefreshPreview(activeKind, activeTemplate)
  }, [activeTemplate, activeKind, debouncedRefreshPreview])

  const updateActiveTemplate = useCallback(
    (nextTemplate: DocumentTemplate) => {
      const normalized = normalizeDocumentTemplate(nextTemplate, activeKind)
      setTemplates((current) => {
        if (!current) return current
        return { ...current, [activeKind]: normalized }
      })
      debouncedSave(activeKind, normalized)
    },
    [activeKind, debouncedSave]
  )

  const handleApplyPreset = useCallback(
    async (kind: InvoiceEstimateDocumentKind, preset: TemplateLayoutPreset) => {
      if (!templates) return

      setIsToolbarBusy(true)
      setSaveStatus('saving')
      try {
        const nextTemplate = applyTemplateLayoutPreset(templates[kind], preset, kind)
        const result = await updateDocumentTemplateAction(kind, nextTemplate)
        if (!result.success) {
          toast.error(result.error || 'Failed to apply preset')
          setSaveStatus('error')
          setSaveMessage(result.error || 'Could not apply preset')
          return
        }

        setTemplates((current) => {
          if (!current) return current
          return { ...current, [kind]: nextTemplate }
        })
        if (kind === activeKind) {
          setSelectedElementId(null)
          void refreshPreview(kind, nextTemplate)
        }
        setSaveStatus('saved')
        toast.success(`${preset === 'compact' ? 'Compact' : 'Classic'} preset applied`)
        setTimeout(() => setSaveStatus('idle'), 2000)
      } finally {
        setIsToolbarBusy(false)
      }
    },
    [activeKind, refreshPreview, templates]
  )

  const handleMoveElement = useCallback(
    (elementId: string, x: number, y: number) => {
      if (!activeTemplate) return
      updateActiveTemplate(
        { ...updateTemplateElement(activeTemplate, elementId, { x, y }), preset: 'custom' }
      )
    },
    [activeTemplate, updateActiveTemplate]
  )

  const handleResizeElement = useCallback(
    (elementId: string, patch: { width?: number; height?: number }) => {
      if (!activeTemplate) return
      updateActiveTemplate(
        {
          ...updateTemplateElement(activeTemplate, elementId, patch),
          preset: 'custom',
        }
      )
    },
    [activeTemplate, updateActiveTemplate]
  )

  const handleUpdateElement = useCallback(
    (elementId: string, patch: Partial<DocumentTemplate['elements'][number]>) => {
      if (!activeTemplate) return
      updateActiveTemplate({
        ...updateTemplateElement(activeTemplate, elementId, patch),
        preset: 'custom',
      })
    },
    [activeTemplate, updateActiveTemplate]
  )

  const handleToggleVisibility = useCallback(
    (elementId: string, visible: boolean) => {
      handleUpdateElement(elementId, { visible })
    },
    [handleUpdateElement]
  )

  const handleResetTemplate = useCallback(
    async (kind: InvoiceEstimateDocumentKind) => {
      setIsToolbarBusy(true)
      setSaveStatus('saving')
      try {
        const result = await resetDocumentTemplateAction(kind)
        if (!result.success) {
          toast.error(result.error || 'Failed to reset template')
          setSaveStatus('error')
          setSaveMessage(result.error || 'Could not reset')
          return
        }

        setTemplates((current) => {
          if (!current) return current
          return { ...current, [kind]: result.template }
        })
        if (kind === activeKind) {
          setSelectedElementId(null)
        }
        setSaveStatus('saved')
        toast.success(`${kind === 'invoice' ? 'Invoice' : 'Estimate'} template reset`)
        setTimeout(() => setSaveStatus('idle'), 2000)
        if (kind === activeKind) {
          void refreshPreview(kind, result.template)
        }
      } finally {
        setIsToolbarBusy(false)
      }
    },
    [activeKind, refreshPreview]
  )

  const handleMatchInvoiceLayout = useCallback(async () => {
    if (!templates) return

    setIsToolbarBusy(true)
    setSaveStatus('saving')
    try {
      const result = await copyInvoiceLayoutToEstimateAction()
      if (!result.success) {
        toast.error(result.error || 'Failed to match invoice layout')
        setSaveStatus('error')
        setSaveMessage(result.error || 'Could not apply layout')
        return
      }

      setTemplates((current) => {
        if (!current) return current
        return { ...current, estimate: result.template }
      })
      setSelectedElementId(null)
      setSaveStatus('saved')
      toast.success('Estimate layout matched to invoice')
      setTimeout(() => setSaveStatus('idle'), 2000)
      if (activeKind === 'estimate') {
        void refreshPreview('estimate', result.template)
      }
    } finally {
      setIsToolbarBusy(false)
    }
  }, [activeKind, refreshPreview, templates])

  const selectedElement = useMemo(
    () => activeTemplate?.elements.find((element) => element.id === selectedElementId) || null,
    [activeTemplate, selectedElementId]
  )

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading document templates…</p>
  }

  if (!templates) {
    return <p className="text-sm text-muted-foreground">Could not load document templates.</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <FileText className="size-5 shrink-0" />
            Document templates
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Customize invoice and estimate PDFs with a live preview. Drag elements, resize your
            logo, adjust table columns, and tune brand colors — changes save automatically.
          </p>
        </div>
        <SaveStatusBadge status={saveStatus} message={saveMessage} className="text-sm" />
      </div>

      <Tabs
        value={activeKind}
        onValueChange={(value) => {
          const nextKind = value === 'estimate' ? 'estimate' : 'invoice'
          setActiveKind(nextKind)
          setSelectedElementId(null)
        }}
      >
        <TabsList className="h-9">
          <TabsTrigger value="invoice" className="px-4 text-sm">
            Invoice
          </TabsTrigger>
          <TabsTrigger value="estimate" className="px-4 text-sm">
            Estimate
          </TabsTrigger>
        </TabsList>

        {(['invoice', 'estimate'] as InvoiceEstimateDocumentKind[]).map((kind) => (
          <TabsContent key={kind} value={kind} className="mt-5 space-y-4">
            <DocumentTemplateToolbar
              kind={kind}
              preset={templates[kind].preset || 'classic'}
              isBusy={isToolbarBusy}
              onReset={() => handleResetTemplate(kind)}
              onApplyPreset={(preset) => handleApplyPreset(kind, preset)}
              onMatchInvoiceLayout={kind === 'estimate' ? handleMatchInvoiceLayout : undefined}
            />
            <DocumentTemplateWorkspace
              kind={kind}
              template={templates[kind]}
              previewUrl={previewUrl}
              isPreviewLoading={isPreviewLoading}
              isActiveKind={kind === activeKind}
              selectedElementId={selectedElementId}
              selectedElement={selectedElement}
              onSelectElement={setSelectedElementId}
              onMoveElement={handleMoveElement}
              onResizeElement={handleResizeElement}
              onToggleVisibility={handleToggleVisibility}
              onUpdateTemplate={updateActiveTemplate}
              onUpdateElement={handleUpdateElement}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}