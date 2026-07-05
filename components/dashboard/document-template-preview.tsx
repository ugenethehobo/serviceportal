'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocumentElement, DocumentKind, DocumentTableColumns, DocumentTemplate } from '@/lib/document-template'
import { DocumentTemplatePdfCanvas } from '@/components/dashboard/document-template-pdf-canvas'
import {
  clampElementPosition,
  clampElementSize,
  clampTableColumns,
  getElementLabel,
  getElementOverlayRect,
  getPreviewDisplayHeight,
  getPreviewScale,
  getTableColumnOffsets,
  getTableColumnPositions,
  isElementValidForKind,
  isResizableElement,
  PREVIEW_DISPLAY_WIDTH,
} from '@/lib/document-template-editor-utils'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type DocumentTemplatePreviewProps = {
  kind: DocumentKind
  template: DocumentTemplate
  previewUrl: string | null
  isLoading: boolean
  selectedElementId: string | null
  onSelectElement: (elementId: string | null) => void
  onMoveElement: (elementId: string, x: number, y: number) => void
  onResizeElement: (elementId: string, patch: { width?: number; height?: number }) => void
  onUpdateTableColumns: (columns: DocumentTableColumns) => void
}

type DragState = {
  mode: 'move' | 'resize' | 'column'
  elementId: string
  columnKey?: keyof DocumentTableColumns
  pointerId: number
  startClientX: number
  startClientY: number
  originX: number
  originY: number
  originWidth: number
  originHeight: number
  originColumnOffset?: number
}

type ElementDraft = {
  x?: number
  y?: number
  width?: number
  height?: number
}

type ColumnDraft = Partial<DocumentTableColumns>

export function DocumentTemplatePreview({
  kind,
  template,
  previewUrl,
  isLoading,
  selectedElementId,
  onSelectElement,
  onMoveElement,
  onResizeElement,
  onUpdateTableColumns,
}: DocumentTemplatePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [displayWidth, setDisplayWidth] = useState(PREVIEW_DISPLAY_WIDTH)
  const dragRef = useRef<DragState | null>(null)
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null)
  const [elementDraft, setElementDraft] = useState<Record<string, ElementDraft>>({})
  const [columnDraft, setColumnDraft] = useState<ColumnDraft>({})

  const scale = getPreviewScale(template, displayWidth)
  const pageDisplayWidth = displayWidth
  const pageDisplayHeight = getPreviewDisplayHeight(template, displayWidth)
  const tableElement = template.elements.find((element) => element.id === 'line-items') || null

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateWidth = () => {
      const nextWidth = Math.max(240, Math.min(container.clientWidth, PREVIEW_DISPLAY_WIDTH))
      setDisplayWidth(nextWidth)
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const getElementState = useCallback(
    (element: DocumentElement) => {
      const draft = elementDraft[element.id]
      return {
        x: draft?.x ?? element.x,
        y: draft?.y ?? element.y,
        width: draft?.width ?? element.width,
        height: draft?.height ?? element.height,
      }
    },
    [elementDraft]
  )

  const getOverlayRect = useCallback(
    (element: DocumentElement) => {
      const state = getElementState(element)
      const base = getElementOverlayRect({
        ...element,
        width: state.width,
        height: state.height,
      })
      return {
        ...base,
        x: state.x,
        y: state.y,
      }
    },
    [getElementState]
  )

  const handleMovePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, element: DocumentElement) => {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)

      const state = getElementState(element)
      dragRef.current = {
        mode: 'move',
        elementId: element.id,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: state.x,
        originY: state.y,
        originWidth: state.width || getElementOverlayRect(element).width,
        originHeight: state.height || getElementOverlayRect(element).height,
      }
      setDraggingElementId(element.id)
      onSelectElement(element.id)
    },
    [getElementState, onSelectElement]
  )

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, element: DocumentElement) => {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)

      const state = getElementState(element)
      const rect = getElementOverlayRect(element)
      dragRef.current = {
        mode: 'resize',
        elementId: element.id,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: state.x,
        originY: state.y,
        originWidth: state.width || rect.width,
        originHeight: state.height || rect.height,
      }
      setDraggingElementId(element.id)
      onSelectElement(element.id)
    },
    [getElementState, onSelectElement]
  )

  const handleColumnPointerDown = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      columnKey: keyof DocumentTableColumns
    ) => {
      if (!tableElement) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)

      const offsets = getTableColumnOffsets(template)
      dragRef.current = {
        mode: 'column',
        elementId: tableElement.id,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        originX: tableElement.x,
        originY: tableElement.y,
        originWidth: tableElement.width || 512,
        originHeight: tableElement.height || 140,
        originColumnOffset: offsets[columnKey],
      }
      setDraggingElementId(tableElement.id)
      onSelectElement(tableElement.id)
    },
    [onSelectElement, tableElement, template]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      const deltaX = (event.clientX - drag.startClientX) / scale
      const deltaY = (event.clientY - drag.startClientY) / scale
      const element = template.elements.find((item) => item.id === drag.elementId)
      if (!element) return

      if (drag.mode === 'move') {
        const next = clampElementPosition(
          {
            ...element,
            width: drag.originWidth,
            height: drag.originHeight,
          },
          drag.originX + deltaX,
          drag.originY + deltaY,
          template
        )

        setElementDraft((current) => ({
          ...current,
          [drag.elementId]: {
            ...current[drag.elementId],
            x: next.x,
            y: next.y,
          },
        }))
        return
      }

      if (drag.mode === 'resize') {
        const nextSize = clampElementSize(
          element,
          drag.originWidth + deltaX,
          drag.originHeight + (element.kind === 'image' ? deltaY : 0),
          template
        )

        setElementDraft((current) => ({
          ...current,
          [drag.elementId]: {
            ...current[drag.elementId],
            width: nextSize.width,
            height: element.kind === 'image' ? nextSize.height : current[drag.elementId]?.height,
          },
        }))
        return
      }

      if (drag.mode === 'column' && drag.columnKey && tableElement) {
        const tableWidth = tableElement.width || 512
        const nextColumns = clampTableColumns(
          {
            ...getTableColumnOffsets(template),
            ...columnDraft,
            [drag.columnKey]: Math.round((drag.originColumnOffset || 0) + deltaX),
          },
          tableWidth
        )

        setColumnDraft(nextColumns)
      }
    },
    [columnDraft, scale, tableElement, template]
  )

  const commitDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      if (drag.mode === 'move') {
        const draft = elementDraft[drag.elementId]
        if (draft?.x !== undefined && draft?.y !== undefined) {
          onMoveElement(drag.elementId, draft.x, draft.y)
        }
      }

      if (drag.mode === 'resize') {
        const draft = elementDraft[drag.elementId]
        if (draft?.width !== undefined || draft?.height !== undefined) {
          onResizeElement(drag.elementId, {
            width: draft?.width,
            height: draft?.height,
          })
        }
      }

      if (drag.mode === 'column' && Object.keys(columnDraft).length > 0) {
        onUpdateTableColumns({
          ...getTableColumnOffsets(template),
          ...columnDraft,
        })
      }

      dragRef.current = null
      setDraggingElementId(null)
      setElementDraft({})
      setColumnDraft({})
    },
    [columnDraft, elementDraft, onMoveElement, onResizeElement, onUpdateTableColumns, template]
  )

  const cancelDrag = useCallback(() => {
    dragRef.current = null
    setDraggingElementId(null)
    setElementDraft({})
    setColumnDraft({})
  }, [])

  const columnPositions =
    tableElement && selectedElementId === 'line-items'
      ? getTableColumnPositions(
          { ...template, tableColumns: { ...getTableColumnOffsets(template), ...columnDraft } },
          tableElement
        )
      : null

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">PDF preview</p>
          <p className="text-xs text-muted-foreground">
            Click or drag elements to reposition them on the page.
          </p>
        </div>
        {isLoading && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Updating…
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="touch-none overflow-x-auto bg-muted/30 p-4 sm:p-6"
        onPointerMove={handlePointerMove}
        onPointerUp={commitDrag}
        onPointerCancel={cancelDrag}
      >
          <div className="flex justify-center">
            <div
              className="relative shrink-0 overflow-hidden rounded-sm bg-white shadow-md ring-1 ring-black/10"
              style={{ width: pageDisplayWidth, height: pageDisplayHeight }}
              onClick={() => onSelectElement(null)}
            >
              {previewUrl ? (
                <DocumentTemplatePdfCanvas
                  url={previewUrl}
                  width={pageDisplayWidth}
                  height={pageDisplayHeight}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-white text-sm text-muted-foreground">
                  {isLoading ? 'Rendering preview…' : 'Preview unavailable'}
                </div>
              )}

              <div className="absolute inset-0">
                {template.elements
                  .filter((element) => element.visible && isElementValidForKind(element, kind))
                  .map((element) => {
                    const rect = getOverlayRect(element)
                    const isSelected = selectedElementId === element.id
                    const isDragging = draggingElementId === element.id
                    const resizable = isResizableElement(element)

                    return (
                      <div
                        key={element.id}
                        className={cn(
                          'group absolute rounded-sm border text-left',
                          isSelected
                            ? 'z-10 border-primary bg-primary/15 shadow-sm ring-2 ring-primary/40'
                            : 'border-primary/25 bg-primary/[0.03] hover:border-primary/50 hover:bg-primary/10',
                          isDragging ? 'transition-none' : 'transition-colors'
                        )}
                        style={{
                          left: rect.x * scale,
                          top: rect.y * scale,
                          width: rect.width * scale,
                          height: rect.height * scale,
                        }}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onSelectElement(element.id)
                          }}
                          onPointerDown={(event) => handleMovePointerDown(event, element)}
                          className="absolute inset-0 cursor-move rounded-sm"
                        >
                          <span
                            className={cn(
                              'absolute left-1 top-1 max-w-[calc(100%-0.5rem)] truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-none shadow-sm',
                              isSelected
                                ? 'bg-primary text-primary-foreground opacity-100'
                                : 'bg-background/90 text-primary opacity-0 group-hover:opacity-100',
                              isDragging && 'opacity-100'
                            )}
                          >
                            {getElementLabel(element)}
                          </span>
                        </button>

                        {isSelected && resizable && (
                          <button
                            type="button"
                            aria-label={`Resize ${getElementLabel(element)}`}
                            onPointerDown={(event) => handleResizePointerDown(event, element)}
                            className="absolute bottom-0 right-0 z-20 size-3.5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm border border-primary bg-background shadow-sm"
                          />
                        )}
                      </div>
                    )
                  })}

                {columnPositions && tableElement && (
                  <>
                    {(['qty', 'unit', 'amount'] as const).map((columnKey) => (
                      <button
                        key={columnKey}
                        type="button"
                        aria-label={`Adjust ${columnKey} column`}
                        onPointerDown={(event) => handleColumnPointerDown(event, columnKey)}
                        className="absolute z-20 w-1.5 -translate-x-1/2 cursor-col-resize rounded-full bg-primary/80 shadow-sm hover:bg-primary"
                        style={{
                          left: columnPositions[columnKey] * scale,
                          top: tableElement.y * scale,
                          height: (tableElement.height || 140) * scale,
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
      </div>
    </div>
  )
}