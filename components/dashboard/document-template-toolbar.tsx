'use client'

import { useState } from 'react'
import type { DocumentKind, DocumentTemplatePreset } from '@/lib/document-template'
import type { TemplateLayoutPreset } from '@/lib/document-template-presets'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Copy, RotateCcw } from 'lucide-react'

type DocumentTemplateToolbarProps = {
  kind: DocumentKind
  preset: DocumentTemplatePreset
  onReset: () => void | Promise<void>
  onApplyPreset: (preset: TemplateLayoutPreset) => void | Promise<void>
  onMatchInvoiceLayout?: () => void | Promise<void>
  isBusy?: boolean
}

export function DocumentTemplateToolbar({
  kind,
  preset,
  onReset,
  onApplyPreset,
  onMatchInvoiceLayout,
  isBusy = false,
}: DocumentTemplateToolbarProps) {
  const [resetOpen, setResetOpen] = useState(false)
  const [matchOpen, setMatchOpen] = useState(false)

  const kindLabel = kind === 'invoice' ? 'invoice' : 'estimate'
  const activePreset = preset === 'compact' ? 'compact' : 'classic'

  const handleReset = async () => {
    await onReset()
    setResetOpen(false)
  }

  const handleMatch = async () => {
    if (!onMatchInvoiceLayout) return
    await onMatchInvoiceLayout()
    setMatchOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={activePreset}
        onValueChange={(value) => {
          const nextPreset = value === 'compact' ? 'compact' : 'classic'
          if (nextPreset !== activePreset) {
            void onApplyPreset(nextPreset)
          }
        }}
        disabled={isBusy}
      >
        <SelectTrigger className="h-8 w-[140px] text-sm">
          <SelectValue placeholder="Layout preset" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="classic">Classic</SelectItem>
          <SelectItem value="compact">Compact</SelectItem>
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        disabled={isBusy}
        onClick={() => setResetOpen(true)}
      >
        <RotateCcw className="size-3.5" />
        Reset to default
      </Button>

      {kind === 'estimate' && onMatchInvoiceLayout && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={isBusy}
          onClick={() => setMatchOpen(true)}
        >
          <Copy className="size-3.5" />
          Match invoice layout
        </Button>
      )}

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset {kindLabel} template?</DialogTitle>
            <DialogDescription>
              This replaces your current {kindLabel} layout with the Classic default. Element
              positions, brand colors, and footer text will be restored. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={() => void handleReset()} disabled={isBusy}>
              Reset template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Match invoice layout?</DialogTitle>
            <DialogDescription>
              Copy element positions and styling from your invoice template onto this estimate.
              Estimate-specific fields like title and description will align with the invoice job
              section. Footer text and estimate content fields are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={() => void handleMatch()} disabled={isBusy}>
              Apply layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}