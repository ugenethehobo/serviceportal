'use client'

import type {
  DocumentBrandColors,
  DocumentElement,
  DocumentKind,
  DocumentTemplate,
} from '@/lib/document-template'
import { DEFAULT_BRAND_COLORS } from '@/lib/document-template'
import { getElementLabel, isInteractiveDocumentElement } from '@/lib/document-template-editor-utils'
import { CONTRACT_MERGE_TAGS } from '@/lib/document-template-fields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Copy, Trash2 } from 'lucide-react'

type DocumentTemplatePropertiesProps = {
  kind: DocumentKind
  template: DocumentTemplate
  selectedElement: DocumentElement | null
  onUpdateTemplate: (template: DocumentTemplate) => void
  onUpdateElement: (elementId: string, patch: Partial<DocumentElement>) => void
  scrollMaxHeight?: string
  embedded?: boolean
  pageCount?: number
  onDeleteElement?: (elementId: string) => void
  onDuplicateElement?: (elementId: string) => void
}

export function DocumentTemplateProperties({
  kind,
  template,
  selectedElement,
  onUpdateTemplate,
  onUpdateElement,
  scrollMaxHeight = 'max-h-[min(70vh,720px)]',
  embedded = false,
  pageCount = 1,
  onDeleteElement,
  onDuplicateElement,
}: DocumentTemplatePropertiesProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', !embedded && 'rounded-xl border bg-card shadow-sm')}>
      <div className="shrink-0 border-b px-4 py-3">
        <p className="text-sm font-medium">
          {selectedElement ? getElementLabel(selectedElement) : 'Template options'}
        </p>
        <p className="text-xs text-muted-foreground">
          {selectedElement
            ? `Position x ${selectedElement.x}, y ${selectedElement.y}${
                pageCount > 1 ? ` · page ${(selectedElement.page ?? 0) + 1}` : ''
              }`
            : kind === 'contract'
              ? 'Brand colors. Select an element to edit it.'
              : 'Document-wide settings and footer text.'}
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName={scrollMaxHeight}>
        <div className="space-y-4 p-4">
          {selectedElement ? (
            <>
              {kind === 'contract' ? (
                <ContractElementProperties
                  selectedElement={selectedElement}
                  pageCount={pageCount}
                  onUpdateElement={onUpdateElement}
                  onDeleteElement={onDeleteElement}
                  onDuplicateElement={onDuplicateElement}
                />
              ) : null}
              <ElementProperties
                selectedElement={selectedElement}
                onUpdateElement={onUpdateElement}
              />
            </>
          ) : (
            <TemplateProperties
              kind={kind}
              template={template}
              onUpdateTemplate={onUpdateTemplate}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function TemplateProperties({
  kind,
  template,
  onUpdateTemplate,
}: {
  kind: DocumentKind
  template: DocumentTemplate
  onUpdateTemplate: (template: DocumentTemplate) => void
}) {
  const brandColors = template.brandColors || DEFAULT_BRAND_COLORS

  const updateBrandColor = (key: keyof DocumentBrandColors, value: string) => {
    onUpdateTemplate({
      ...template,
      preset: 'custom',
      brandColors: {
        ...brandColors,
        [key]: value,
      },
    })
  }

  return (
    <>
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Brand colors
        </p>
        <div className="grid grid-cols-2 gap-3">
          <BrandColorField
            id="brand-primary"
            label="Primary text"
            value={brandColors.primary || DEFAULT_BRAND_COLORS.primary!}
            onChange={(value) => updateBrandColor('primary', value)}
          />
          <BrandColorField
            id="brand-accent"
            label="Accent"
            value={brandColors.accent || DEFAULT_BRAND_COLORS.accent!}
            onChange={(value) => updateBrandColor('accent', value)}
          />
          <BrandColorField
            id="brand-muted"
            label="Muted text"
            value={brandColors.muted || DEFAULT_BRAND_COLORS.muted!}
            onChange={(value) => updateBrandColor('muted', value)}
          />
          <BrandColorField
            id="brand-border"
            label="Borders"
            value={brandColors.border || DEFAULT_BRAND_COLORS.border!}
            onChange={(value) => updateBrandColor('border', value)}
          />
        </div>
      </div>

      <Separator />

      {kind === 'invoice' && (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="show-payments" className="text-sm font-normal">
            Show payments section
          </Label>
          <Switch
            id="show-payments"
            checked={template.showPayments !== false}
            onCheckedChange={(checked) =>
              onUpdateTemplate({ ...template, showPayments: checked })
            }
          />
        </div>
      )}

      {kind === 'invoice' && <Separator />}

      {(kind !== 'contract' ||
        template.elements.some((element) => element.fieldKey === 'footer.text')) && (
      <div className="space-y-2">
        <Label htmlFor="footer-due-text" className="text-sm">
          {kind === 'invoice' ? 'Footer note (balance due)' : 'Footer note'}
        </Label>
        <Textarea
          id="footer-due-text"
          value={template.footerDueText || ''}
          onChange={(event) =>
            onUpdateTemplate({ ...template, footerDueText: event.target.value })
          }
          rows={3}
          className="resize-none text-sm"
        />
      </div>
      )}

      {kind === 'invoice' && (
        <div className="space-y-2">
          <Label htmlFor="footer-paid-text" className="text-sm">
            Footer note (paid in full)
          </Label>
          <Textarea
            id="footer-paid-text"
            value={template.footerPaidText || ''}
            onChange={(event) =>
              onUpdateTemplate({ ...template, footerPaidText: event.target.value })
            }
            rows={3}
            className="resize-none text-sm"
          />
        </div>
      )}
    </>
  )
}

function ElementProperties({
  selectedElement,
  onUpdateElement,
}: {
  selectedElement: DocumentElement
  onUpdateElement: (elementId: string, patch: Partial<DocumentElement>) => void
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="element-visible" className="text-sm font-normal">
          Visible on PDF
        </Label>
        <Switch
          id="element-visible"
          checked={selectedElement.visible}
          onCheckedChange={(checked) =>
            onUpdateElement(selectedElement.id, { visible: checked })
          }
        />
      </div>

      <Separator />

      {selectedElement.fieldKey === 'bill_to.label' && (
        <div className="space-y-2">
          <Label htmlFor="bill-to-label" className="text-sm">
            Bill to label
          </Label>
          <Input
            id="bill-to-label"
            value={selectedElement.label || ''}
            onChange={(event) =>
              onUpdateElement(selectedElement.id, {
                label: event.target.value || undefined,
              })
            }
            placeholder="Bill To"
          />
        </div>
      )}

      {selectedElement.kind === 'text' && (
        <div className="space-y-2">
          <Label htmlFor="custom-text" className="text-sm">
            Text
          </Label>
          <Textarea
            id="custom-text"
            value={selectedElement.text || ''}
            onChange={(event) =>
              onUpdateElement(selectedElement.id, { text: event.target.value })
            }
            rows={6}
            className="resize-y text-sm"
          />
          <MergeTagPicker
            onInsert={(tag) =>
              onUpdateElement(selectedElement.id, {
                text: `${selectedElement.text || ''}${
                  selectedElement.text && !/\s$/.test(selectedElement.text) ? ' ' : ''
                }${tag}`,
              })
            }
          />
        </div>
      )}

      {isInteractiveDocumentElement(selectedElement) && (
        <div className="space-y-2">
          <Label htmlFor="field-label" className="text-sm">
            Field label
          </Label>
          <Input
            id="field-label"
            value={selectedElement.label || ''}
            onChange={(event) =>
              onUpdateElement(selectedElement.id, {
                label: event.target.value || undefined,
              })
            }
            placeholder={
              selectedElement.kind === 'signature'
                ? 'Client signature'
                : selectedElement.kind === 'initial'
                  ? 'Client initials'
                  : selectedElement.kind === 'checkbox'
                    ? 'I agree to the terms'
                    : 'Text field'
            }
          />
          {selectedElement.kind === 'input' ? (
            <p className="text-xs text-muted-foreground">
              {selectedElement.filledBy === 'staff'
                ? 'Your team fills this in on each contract before sending it.'
                : 'Clients fill this in when signing the contract.'}
            </p>
          ) : null}
        </div>
      )}

      {selectedElement.kind !== 'table' && selectedElement.kind !== 'line' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="font-size" className="text-sm">
              Font size
            </Label>
            <Input
              id="font-size"
              type="number"
              min={8}
              max={32}
              value={selectedElement.fontSize || 10}
              onChange={(event) =>
                onUpdateElement(selectedElement.id, {
                  fontSize: Number(event.target.value) || 10,
                })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="font-bold" className="text-sm font-normal">
              Bold
            </Label>
            <Switch
              id="font-bold"
              checked={selectedElement.fontWeight === 'bold'}
              onCheckedChange={(checked) =>
                onUpdateElement(selectedElement.id, {
                  fontWeight: checked ? 'bold' : 'normal',
                })
              }
            />
          </div>

          {selectedElement.layout === 'absolute' && (
            <div className="space-y-2">
              <Label className="text-sm">Alignment</Label>
              <Select
                value={selectedElement.align || 'left'}
                onValueChange={(value) =>
                  onUpdateElement(selectedElement.id, {
                    align: value as 'left' | 'center' | 'right',
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      {selectedElement.fieldKey === 'company.logo' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="logo-width" className="text-sm">
              Logo width
            </Label>
            <Input
              id="logo-width"
              type="number"
              min={40}
              max={240}
              value={selectedElement.width || 110}
              onChange={(event) =>
                onUpdateElement(selectedElement.id, {
                  width: Number(event.target.value) || 110,
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo-height" className="text-sm">
              Logo height
            </Label>
            <Input
              id="logo-height"
              type="number"
              min={24}
              max={160}
              value={selectedElement.height || 52}
              onChange={(event) =>
                onUpdateElement(selectedElement.id, {
                  height: Number(event.target.value) || 52,
                })
              }
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Uses your company logo from Settings. Drag and resize on the preview to position it.
          </p>
        </>
      )}

      {selectedElement.kind === 'table' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="table-width" className="text-sm">
              Table width
            </Label>
            <Input
              id="table-width"
              type="number"
              min={240}
              max={512}
              value={selectedElement.width || 512}
              onChange={(event) =>
                onUpdateElement(selectedElement.id, {
                  width: Number(event.target.value) || 512,
                })
              }
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Drag the column guides on the preview to adjust Qty, Unit Price, and Amount columns.
          </p>
        </>
      )}

      {selectedElement.kind !== 'table' &&
        selectedElement.kind !== 'line' &&
        selectedElement.kind !== 'image' && (
          <div className="space-y-2">
            <Label htmlFor="element-color" className="text-sm">
              Text color
            </Label>
            <Input
              id="element-color"
              type="color"
              value={selectedElement.color || '#1a1a1a'}
              onChange={(event) =>
                onUpdateElement(selectedElement.id, { color: event.target.value })
              }
              className="h-9 w-full cursor-pointer p-1"
            />
          </div>
        )}
    </>
  )
}

function BrandColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full cursor-pointer p-1"
      />
    </div>
  )
}
function MergeTagPicker({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        Insert client and job details. They fill in automatically on each contract.
      </p>
      <div className="flex flex-wrap gap-1">
        {CONTRACT_MERGE_TAGS.map((item) => (
          <button
            key={item.tag}
            type="button"
            onClick={() => onInsert(item.tag)}
            className="rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px] hover:bg-muted"
            title={item.tag}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        value={Math.round(value)}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(Math.max(0, next))
        }}
        className="h-8"
      />
    </div>
  )
}

function ContractElementProperties({
  selectedElement,
  pageCount,
  onUpdateElement,
  onDeleteElement,
  onDuplicateElement,
}: {
  selectedElement: DocumentElement
  pageCount: number
  onUpdateElement: (elementId: string, patch: Partial<DocumentElement>) => void
  onDeleteElement?: (elementId: string) => void
  onDuplicateElement?: (elementId: string) => void
}) {
  const id = selectedElement.id
  const interactive = isInteractiveDocumentElement(selectedElement)
  const supportsAppearance = interactive || selectedElement.kind === 'field'

  return (
    <>
      <div className="flex gap-2">
        {onDuplicateElement ? (
          <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => onDuplicateElement(id)}>
            <Copy className="size-3.5" />
            Duplicate
          </Button>
        ) : null}
        {onDeleteElement ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1 text-destructive hover:text-destructive"
            onClick={() => onDeleteElement(id)}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField id="element-x" label="X" value={selectedElement.x} onChange={(x) => onUpdateElement(id, { x })} />
        <NumberField id="element-y" label="Y" value={selectedElement.y} onChange={(y) => onUpdateElement(id, { y })} />
        {selectedElement.width !== undefined || interactive || selectedElement.kind === 'text' ? (
          <NumberField
            id="element-width"
            label="Width"
            value={selectedElement.width ?? 220}
            onChange={(width) => onUpdateElement(id, { width: Math.max(10, width) })}
          />
        ) : null}
        {interactive || selectedElement.kind === 'text' || selectedElement.kind === 'image' ? (
          <NumberField
            id="element-height"
            label="Height"
            value={selectedElement.height ?? 48}
            onChange={(height) => onUpdateElement(id, { height: Math.max(10, height) })}
          />
        ) : null}
      </div>

      {pageCount > 1 ? (
        <div className="space-y-2">
          <Label className="text-sm">Page</Label>
          <Select
            value={String(selectedElement.page ?? 0)}
            onValueChange={(value) => {
              const page = Number(value ?? 0)
              onUpdateElement(id, { page: page > 0 ? page : undefined })
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{`Page ${(selectedElement.page ?? 0) + 1}`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: pageCount }, (_, index) => (
                <SelectItem key={index} value={String(index)}>
                  Page {index + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {selectedElement.kind === 'input' ? (
        <div className="space-y-2">
          <Label className="text-sm">Filled in by</Label>
          <Select
            value={selectedElement.filledBy === 'staff' ? 'staff' : 'client'}
            onValueChange={(value) => {
              const staff = value === 'staff'
              const key = selectedElement.fieldKey || ''
              const suffix = key.replace(/^(input|staff)\./, '') || id
              onUpdateElement(id, {
                filledBy: staff ? 'staff' : undefined,
                fieldKey: `${staff ? 'staff' : 'input'}.${suffix}`,
              })
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {selectedElement.filledBy === 'staff' ? 'Your team (before sending)' : 'Client (when signing)'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client">Client (when signing)</SelectItem>
              <SelectItem value="staff">Your team (before sending)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {selectedElement.kind === 'input' || selectedElement.kind === 'checkbox' ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="element-required" className="text-sm font-normal">
            Required
          </Label>
          <Switch
            id="element-required"
            checked={selectedElement.required !== false}
            onCheckedChange={(checked) => onUpdateElement(id, { required: checked ? undefined : false })}
          />
        </div>
      ) : null}

      {supportsAppearance ? (
        <div className="space-y-2">
          <Label className="text-sm">Style</Label>
          <Select
            value={selectedElement.appearance === 'overlay' ? 'overlay' : 'boxed'}
            onValueChange={(value) =>
              onUpdateElement(id, { appearance: value === 'overlay' ? 'overlay' : undefined })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {selectedElement.appearance === 'overlay' ? 'Value only' : 'Labeled'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="boxed">Labeled</SelectItem>
              <SelectItem value="overlay">Value only</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Use &ldquo;Value only&rdquo; to write onto a blank line in an uploaded PDF.
          </p>
        </div>
      ) : null}

      <Separator />
    </>
  )
}
