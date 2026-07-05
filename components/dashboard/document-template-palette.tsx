'use client'

import type { DocumentElement, DocumentKind, DocumentTemplate } from '@/lib/document-template'
import {
  getElementLabel,
  groupElementsForKind,
} from '@/lib/document-template-editor-utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type DocumentTemplatePaletteProps = {
  kind: DocumentKind
  template: DocumentTemplate
  selectedElementId: string | null
  onSelectElement: (elementId: string) => void
  onToggleVisibility: (elementId: string, visible: boolean) => void
  scrollMaxHeight?: string
  embedded?: boolean
}

export function DocumentTemplatePalette({
  kind,
  template,
  selectedElementId,
  onSelectElement,
  onToggleVisibility,
  scrollMaxHeight = 'max-h-[min(70vh,720px)]',
  embedded = false,
}: DocumentTemplatePaletteProps) {
  const groups = groupElementsForKind(template, kind)

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', !embedded && 'rounded-xl border bg-card shadow-sm')}>
      <div className="shrink-0 border-b px-4 py-3">
        <p className="text-sm font-medium">Elements</p>
        <p className="text-xs text-muted-foreground">
          Toggle visibility or select to edit.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName={scrollMaxHeight}>
        <div className="space-y-4 p-3">
          {groups.map(({ group, elements }) => (
            <div key={group}>
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              <div className="space-y-1">
                {elements.map((element) => (
                  <PaletteRow
                    key={element.id}
                    element={element}
                    selected={selectedElementId === element.id}
                    onSelect={() => onSelectElement(element.id)}
                    onToggleVisibility={(visible) => onToggleVisibility(element.id, visible)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function PaletteRow({
  element,
  selected,
  onSelect,
  onToggleVisibility,
}: {
  element: DocumentElement
  selected: boolean
  onSelect: () => void
  onToggleVisibility: (visible: boolean) => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors',
        selected ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted/50',
        !element.visible && 'opacity-50'
      )}
    >
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{getElementLabel(element)}</p>
        {!element.visible && (
          <p className="text-[11px] text-muted-foreground">Hidden</p>
        )}
      </button>
      <Switch
        checked={element.visible}
        onCheckedChange={onToggleVisibility}
        aria-label={`Toggle ${getElementLabel(element)}`}
      />
    </div>
  )
}