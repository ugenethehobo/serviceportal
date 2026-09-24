'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DocumentTemplateWorkspace } from '@/components/dashboard/document-template-workspace'
import { DOCUMENT_FIELD_DRAG_TYPE } from '@/components/dashboard/document-template-preview'
import { Button } from '@/components/ui/button'
import {
  CONTRACT_FIELD_GROUP_LABELS,
  createContractElement,
  duplicateContractElement,
  getContractFieldPresets,
  type ContractFieldPreset,
  type ContractFieldPresetGroup,
} from '@/lib/contract-field-presets'
import {
  DOCUMENT_PAGE,
  getDocumentPageCount,
  getDocumentPageSize,
  getElementPageIndex,
  MAX_CONTRACT_PAGES,
  type DocumentElement,
  type DocumentTemplate,
} from '@/lib/document-template'
import { updateTemplateElement } from '@/lib/document-template-editor-utils'
import { cn } from '@/lib/utils'
import {
  Building2,
  CalendarCheck,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileMinus2,
  Minus,
  PenLine,
  Redo2,
  Signature,
  TextCursorInput,
  Type,
  Undo2,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

const HISTORY_LIMIT = 60

function presetIcon(preset: ContractFieldPreset): LucideIcon {
  switch (preset.id) {
    case 'signature':
      return Signature
    case 'initials':
      return PenLine
    case 'client-text':
      return TextCursorInput
    case 'checkbox':
      return CheckSquare
    case 'signed-date':
      return CalendarCheck
    case 'signed-name':
      return UserRound
    case 'team-text':
      return UsersRound
    case 'text-block':
      return Type
    case 'divider':
      return Minus
    case 'logo':
      return Building2
    default:
      return UserRound
  }
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

type ContractDocumentEditorProps = {
  template: DocumentTemplate
  onChange: (template: DocumentTemplate) => void
  previewUrl: string | null
  isPreviewLoading: boolean
  /** Read-only view (e.g. a contract that was already sent). */
  readOnly?: boolean
  toolbarExtras?: ReactNode
}

export function ContractDocumentEditor({
  template,
  onChange,
  previewUrl,
  isPreviewLoading,
  readOnly = false,
  toolbarExtras,
}: ContractDocumentEditorProps) {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const pastRef = useRef<DocumentTemplate[]>([])
  const futureRef = useRef<DocumentTemplate[]>([])
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 })

  const pdfMode = !!template.background
  const pageCount = getDocumentPageCount(template)
  const currentPage = Math.min(pageIndex, pageCount - 1)
  const presets = useMemo(() => getContractFieldPresets(pdfMode), [pdfMode])

  const syncHistorySize = () =>
    setHistorySize({ past: pastRef.current.length, future: futureRef.current.length })

  const commit = useCallback(
    (next: DocumentTemplate) => {
      if (readOnly) return
      pastRef.current = [...pastRef.current, template].slice(-HISTORY_LIMIT)
      futureRef.current = []
      syncHistorySize()
      onChange({ ...next, preset: 'custom' })
    },
    [onChange, readOnly, template]
  )

  const undo = useCallback(() => {
    const previous = pastRef.current.at(-1)
    if (!previous || readOnly) return
    pastRef.current = pastRef.current.slice(0, -1)
    futureRef.current = [template, ...futureRef.current].slice(0, HISTORY_LIMIT)
    syncHistorySize()
    onChange(previous)
  }, [onChange, readOnly, template])

  const redo = useCallback(() => {
    const next = futureRef.current[0]
    if (!next || readOnly) return
    futureRef.current = futureRef.current.slice(1)
    pastRef.current = [...pastRef.current, template].slice(-HISTORY_LIMIT)
    syncHistorySize()
    onChange(next)
  }, [onChange, readOnly, template])

  const selectedElement = useMemo(
    () => template.elements.find((element) => element.id === selectedElementId) || null,
    [template, selectedElementId]
  )

  const handleSelectElement = useCallback(
    (elementId: string | null) => {
      setSelectedElementId(elementId)
      const element = elementId ? template.elements.find((item) => item.id === elementId) : null
      if (element) setPageIndex(getElementPageIndex(element))
    },
    [template]
  )

  const addElement = useCallback(
    (presetId: string, x?: number, y?: number) => {
      const pageSize = getDocumentPageSize(template, currentPage)
      const element = createContractElement(presetId, {
        x: x ?? pageSize.width / 2,
        y: y ?? pageSize.height / 3,
        page: currentPage,
        pageSize,
        pdfMode,
      })
      if (!element) return
      commit({ ...template, elements: [...template.elements, element] })
      setSelectedElementId(element.id)
    },
    [commit, currentPage, pdfMode, template]
  )

  const deleteElement = useCallback(
    (elementId: string) => {
      commit({
        ...template,
        elements: template.elements.filter((element) => element.id !== elementId),
      })
      setSelectedElementId(null)
    },
    [commit, template]
  )

  const duplicateElement = useCallback(
    (elementId: string) => {
      const source = template.elements.find((element) => element.id === elementId)
      if (!source) return
      const copy = duplicateContractElement(source)
      commit({ ...template, elements: [...template.elements, copy] })
      setSelectedElementId(copy.id)
    },
    [commit, template]
  )

  const updateElement = useCallback(
    (elementId: string, patch: Partial<DocumentElement>) => {
      commit(updateTemplateElement(template, elementId, patch))
      if (patch.page !== undefined || 'page' in patch) {
        setPageIndex(patch.page ?? 0)
      }
    },
    [commit, template]
  )

  const addPage = useCallback(() => {
    if (pdfMode || pageCount >= MAX_CONTRACT_PAGES) return
    const pages = Array.from({ length: pageCount }, (_, index) => getDocumentPageSize(template, index))
    commit({ ...template, pages: [...pages, { ...DOCUMENT_PAGE }] })
    setPageIndex(pageCount)
  }, [commit, pageCount, pdfMode, template])

  const removePage = useCallback(() => {
    if (pdfMode || pageCount <= 1) return
    const removed = currentPage
    const pages = Array.from({ length: pageCount }, (_, index) => getDocumentPageSize(template, index))
    const elements = template.elements
      .filter((element) => getElementPageIndex(element) !== removed)
      .map((element) => {
        const page = getElementPageIndex(element)
        if (page < removed) return element
        const nextPage = page - 1
        return { ...element, page: nextPage > 0 ? nextPage : undefined }
      })
    commit({ ...template, pages: pages.filter((_, index) => index !== removed), elements })
    setPageIndex(Math.max(0, removed - 1))
    setSelectedElementId(null)
  }, [commit, currentPage, pageCount, pdfMode, template])

  useEffect(() => {
    if (readOnly) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      const mod = event.metaKey || event.ctrlKey

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (!selectedElement) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteElement(selectedElement.id)
        return
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateElement(selectedElement.id)
        return
      }
      const step = event.shiftKey ? 10 : 1
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const move = delta[event.key]
      if (move) {
        event.preventDefault()
        updateElement(selectedElement.id, {
          x: Math.max(0, selectedElement.x + move[0]),
          y: Math.max(0, selectedElement.y + move[1]),
        })
      }
      if (event.key === 'Escape') setSelectedElementId(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteElement, duplicateElement, readOnly, redo, selectedElement, undo, updateElement])

  const groupedPresets = useMemo(() => {
    const groups = new Map<ContractFieldPresetGroup, ContractFieldPreset[]>()
    for (const preset of presets) {
      groups.set(preset.group, [...(groups.get(preset.group) || []), preset])
    }
    return [...groups.entries()]
  }, [presets])

  const toolbox = readOnly ? null : (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium">Add fields</p>
        <p className="text-xs text-muted-foreground">Drag onto the page, or click to add.</p>
      </div>
      <div className="max-h-[min(50vh,480px)] space-y-3 overflow-y-auto p-3">
        {groupedPresets.map(([group, items]) => (
          <div key={group}>
            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {CONTRACT_FIELD_GROUP_LABELS[group]}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((preset) => {
                const Icon = presetIcon(preset)
                return (
                  <button
                    key={preset.id}
                    type="button"
                    draggable
                    title={preset.description}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(DOCUMENT_FIELD_DRAG_TYPE, preset.id)
                      event.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => addElement(preset.id)}
                    className={cn(
                      'flex cursor-grab items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted active:cursor-grabbing',
                      group === 'client' && 'border-amber-300/70 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5',
                      group === 'team' && 'border-sky-300/70 bg-sky-50/60 dark:border-sky-500/30 dark:bg-sky-500/5'
                    )}
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{preset.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const pageControls = (
    <div className="flex items-center gap-1">
      {pageCount > 1 ? (
        <>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Previous page"
            disabled={currentPage === 0}
            onClick={() => setPageIndex(currentPage - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground">
            Page {currentPage + 1} / {pageCount}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Next page"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPageIndex(currentPage + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </>
      ) : null}
      {!pdfMode && !readOnly ? (
        <>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Add page" title="Add page" onClick={addPage}>
            <FilePlus2 className="size-4" />
          </Button>
          {pageCount > 1 ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Remove this page"
              title="Remove this page and its fields"
              onClick={removePage}
            >
              <FileMinus2 className="size-4" />
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={undo}
              disabled={historySize.past === 0}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="size-4" />
              Undo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={redo}
              disabled={historySize.future === 0}
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="size-4" />
              Redo
            </Button>
          </>
        ) : null}
        {toolbarExtras}
        {!readOnly ? (
          <p className="ml-auto hidden text-xs text-muted-foreground lg:block">
            Delete removes · Ctrl+D duplicates · arrow keys nudge
          </p>
        ) : null}
      </div>

      <DocumentTemplateWorkspace
        kind="contract"
        template={template}
        previewUrl={previewUrl}
        isPreviewLoading={isPreviewLoading}
        isActiveKind
        selectedElementId={readOnly ? null : selectedElementId}
        selectedElement={readOnly ? null : selectedElement}
        onSelectElement={readOnly ? () => undefined : handleSelectElement}
        onMoveElement={(elementId, x, y) => updateElement(elementId, { x, y })}
        onResizeElement={(elementId, patch) => updateElement(elementId, patch)}
        onToggleVisibility={(elementId, visible) => updateElement(elementId, { visible })}
        onUpdateTemplate={commit}
        onUpdateElement={updateElement}
        pageIndex={currentPage}
        onDropNewElement={readOnly ? undefined : (presetId, x, y) => addElement(presetId, x, y)}
        onDeleteElement={readOnly ? undefined : deleteElement}
        onDuplicateElement={readOnly ? undefined : duplicateElement}
        previewHeaderActions={pageControls}
        previewDescription={
          readOnly
            ? 'Read-only. Recall the contract to make changes.'
            : pdfMode
              ? 'Drag fields onto your PDF. Yellow fields are for the client, blue for your team.'
              : 'Drag to move, use the corner handle to resize.'
        }
        sidebarTop={toolbox}
      />
    </div>
  )
}
