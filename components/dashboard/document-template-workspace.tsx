'use client'

import { useState } from 'react'
import { DocumentTemplatePalette } from '@/components/dashboard/document-template-palette'
import { DocumentTemplatePreview } from '@/components/dashboard/document-template-preview'
import { DocumentTemplateProperties } from '@/components/dashboard/document-template-properties'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { DocumentElement, DocumentKind, DocumentTemplate } from '@/lib/document-template'

type DocumentTemplateWorkspaceProps = {
  kind: DocumentKind
  template: DocumentTemplate
  previewUrl: string | null
  isPreviewLoading: boolean
  isActiveKind: boolean
  selectedElementId: string | null
  selectedElement: DocumentElement | null
  onSelectElement: (elementId: string | null) => void
  onMoveElement: (elementId: string, x: number, y: number) => void
  onResizeElement: (elementId: string, patch: { width?: number; height?: number }) => void
  onToggleVisibility: (elementId: string, visible: boolean) => void
  onUpdateTemplate: (template: DocumentTemplate) => void
  onUpdateElement: (elementId: string, patch: Partial<DocumentElement>) => void
}

export function DocumentTemplateWorkspace({
  kind,
  template,
  previewUrl,
  isPreviewLoading,
  isActiveKind,
  selectedElementId,
  selectedElement,
  onSelectElement,
  onMoveElement,
  onResizeElement,
  onToggleVisibility,
  onUpdateTemplate,
  onUpdateElement,
}: DocumentTemplateWorkspaceProps) {
  const [sidePanel, setSidePanel] = useState<'elements' | 'properties'>('elements')

  const handleSelectElement = (elementId: string | null) => {
    onSelectElement(elementId)
    if (elementId) {
      setSidePanel('properties')
    }
  }

  const palette = (
    <DocumentTemplatePalette
      kind={kind}
      template={template}
      selectedElementId={selectedElementId}
      onSelectElement={(elementId) => handleSelectElement(elementId)}
      onToggleVisibility={onToggleVisibility}
      embedded
    />
  )

  const properties = (
    <DocumentTemplateProperties
      kind={kind}
      template={template}
      selectedElement={isActiveKind ? selectedElement : null}
      onUpdateTemplate={onUpdateTemplate}
      onUpdateElement={onUpdateElement}
      embedded
    />
  )

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-5">
      <section className="min-w-0 flex-1 xl:order-2">
        <DocumentTemplatePreview
          kind={kind}
          template={template}
          previewUrl={isActiveKind ? previewUrl : null}
          isLoading={isActiveKind && isPreviewLoading}
          selectedElementId={selectedElementId}
          onSelectElement={handleSelectElement}
          onMoveElement={onMoveElement}
          onResizeElement={onResizeElement}
          onUpdateTableColumns={(columns) =>
            onUpdateTemplate({ ...template, tableColumns: columns, preset: 'custom' })
          }
        />
      </section>

      <aside className="shrink-0 xl:sticky xl:top-0 xl:order-1 xl:w-80 xl:max-w-[320px] xl:self-start">
        <div className="hidden flex-col gap-4 xl:flex">
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {palette}
          </div>
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {properties}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-sm xl:hidden">
          <Tabs
            value={sidePanel}
            onValueChange={(value) =>
              setSidePanel(value === 'properties' ? 'properties' : 'elements')
            }
          >
            <div className="border-b px-3 pt-3 pb-2">
              <TabsList className="grid h-9 w-full grid-cols-2">
                <TabsTrigger value="elements" className="text-sm">
                  Elements
                </TabsTrigger>
                <TabsTrigger value="properties" className="text-sm">
                  Properties
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="elements" className="mt-0">
              {palette}
            </TabsContent>
            <TabsContent value="properties" className="mt-0">
              {properties}
            </TabsContent>
          </Tabs>
        </div>
      </aside>
    </div>
  )
}