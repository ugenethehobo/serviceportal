'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getInvoiceTemplateAction,
  updateInvoiceTemplateAction,
} from '@/app/action'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  INVOICE_TEMPLATE_BLOCK_LABELS,
  type InvoiceTemplate,
  type InvoiceTemplateBlock,
} from '@/lib/invoice-template'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, FileText, GripVertical } from 'lucide-react'

export function InvoiceTemplateSettings() {
  const [template, setTemplate] = useState<InvoiceTemplate | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    const result = await getInvoiceTemplateAction()
    if (result.success) {
      setTemplate(result.template)
    } else {
      toast.error(result.error || 'Failed to load invoice template')
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const moveBlock = (index: number, direction: -1 | 1) => {
    if (!template) return
    const next = [...template.blocks]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setTemplate({ ...template, blocks: next })
  }

  const toggleBlock = (index: number, enabled: boolean) => {
    if (!template) return
    const blocks = template.blocks.map((block, i) =>
      i === index ? { ...block, enabled } : block
    )
    setTemplate({ ...template, blocks })
  }

  const updateBlockLabel = (index: number, label: string) => {
    if (!template) return
    const blocks = template.blocks.map((block, i) =>
      i === index ? { ...block, label: label || undefined } : block
    )
    setTemplate({ ...template, blocks })
  }

  const handleSave = async () => {
    if (!template) return
    setIsSaving(true)
    const result = await updateInvoiceTemplateAction(template)
    if (result.success) {
      toast.success('Invoice template saved')
    } else {
      toast.error(result.error || 'Failed to save template')
    }
    setIsSaving(false)
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading invoice template…</p>
  }

  if (!template) {
    return <p className="text-sm text-muted-foreground">Could not load invoice template.</p>
  }

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="size-5" />
          Invoice template
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Arrange sections on your PDF invoices. The line items table is placed wherever you
          position the &quot;Line items table&quot; block — move it to control where charges appear.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Template sections (top to bottom on PDF)</Label>
        <div className="space-y-2">
          {template.blocks.map((block: InvoiceTemplateBlock, index: number) => (
            <div
              key={block.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2.5',
                block.type === 'line_items' && 'border-primary/40 bg-primary/5',
                !block.enabled && 'opacity-60'
              )}
            >
              <GripVertical className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {INVOICE_TEMPLATE_BLOCK_LABELS[block.type]}
                  {block.type === 'line_items' && (
                    <span className="ml-2 text-xs font-normal text-primary">
                      Line items placement
                    </span>
                  )}
                </p>
                {block.type === 'bill_to' && (
                  <Input
                    className="mt-1.5 h-8 text-xs"
                    value={block.label || ''}
                    placeholder="Bill To"
                    onChange={(e) => updateBlockLabel(index, e.target.value)}
                  />
                )}
              </div>
              <Switch
                checked={block.enabled}
                onCheckedChange={(checked) => toggleBlock(index, checked)}
                aria-label={`Toggle ${INVOICE_TEMPLATE_BLOCK_LABELS[block.type]}`}
              />
              <div className="flex flex-col gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={index === 0}
                  onClick={() => moveBlock(index, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={index === template.blocks.length - 1}
                  onClick={() => moveBlock(index, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="show-payments">Show payments section</Label>
          <Switch
            id="show-payments"
            checked={template.showPayments}
            onCheckedChange={(checked) =>
              setTemplate({ ...template, showPayments: checked })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="footer-text">Footer note (when balance is due)</Label>
        <Textarea
          id="footer-text"
          value={template.footerText}
          onChange={(e) => setTemplate({ ...template, footerText: e.target.value })}
          rows={3}
        />
      </div>

      <Button onClick={() => void handleSave()} disabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save invoice template'}
      </Button>
    </Card>
  )
}