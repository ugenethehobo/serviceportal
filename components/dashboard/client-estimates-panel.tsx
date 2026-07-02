'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getClientEstimatesAction,
  createEstimateAction,
  updateEstimateAction,
  deleteEstimateAction,
  setEstimateStatusAction,
  addEstimateLineItemAction,
  updateEstimateLineItemAction,
  deleteEstimateLineItemAction,
} from '@/app/action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/billing'
import {
  ESTIMATE_STATUS_LABELS,
  formatEstimateNumber,
  type Estimate,
  type EstimateLineItem,
  type EstimateStatus,
} from '@/lib/estimates'
import { toast } from 'sonner'
import { Trash2, ArrowRight, Plus, FileDown, X, Check } from 'lucide-react'

interface ClientEstimatesPanelProps {
  clientId: string
  onConvertToJob: (estimate: Estimate) => void
  onDocumentsChange?: () => void
}

function calcPreview(qty: string, price: string) {
  const q = parseFloat(qty) || 0
  const p = parseFloat(price) || 0
  return Math.round(q * p * 100) / 100
}

const emptyLineForm = { description: '', quantity: '1', unitPrice: '' }

type SaveState = 'idle' | 'saving' | 'saved'

export function ClientEstimatesPanel({
  clientId,
  onConvertToJob,
  onDocumentsChange,
}: ClientEstimatesPanelProps) {
  const supabase = createClient()

  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [companyId, setCompanyId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLineSaving, setIsLineSaving] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isCreateMode, setIsCreateMode] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [editForm, setEditForm] = useState({ title: '', description: '' })
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [lineForm, setLineForm] = useState(emptyLineForm)

  const savedFormRef = useRef('')
  const isPersistingRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedEstimate = estimates.find((e) => e.id === selectedId) ?? null

  const fetchEstimates = useCallback(async () => {
    const result = await getClientEstimatesAction(clientId)
    if (result.success) {
      setEstimates((result.estimates || []) as Estimate[])
    } else {
      toast.error(result.error || 'Failed to load estimates')
    }
    setIsLoading(false)
  }, [clientId])

  const refreshSelected = useCallback(async () => {
    const result = await getClientEstimatesAction(clientId)
    if (result.success) {
      const list = (result.estimates || []) as Estimate[]
      setEstimates(list)
      return list.find((e) => e.id === selectedId) ?? null
    }
    return null
  }, [clientId, selectedId])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', user.id)
          .single()
        if (profile?.company_id) setCompanyId(profile.company_id)
      }
      await fetchEstimates()
    }
    load()
  }, [supabase, fetchEstimates])

  const formSnapshot = () => `${editForm.title}|||${editForm.description}`

  const markSaved = () => {
    setSaveState('saved')
    if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current)
    savedIndicatorTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
  }

  const persistEstimate = useCallback(async () => {
    if (!editForm.title.trim()) return
    if (isPersistingRef.current) return

    const snapshot = formSnapshot()
    if (snapshot === savedFormRef.current && !isCreateMode) return

    isPersistingRef.current = true
    setSaveState('saving')

    try {
      if (isCreateMode) {
        const result = await createEstimateAction({
          clientId,
          companyId,
          title: editForm.title,
          description: editForm.description,
        })
        if (result.success && result.estimate) {
          const created = result.estimate as Estimate
          setIsCreateMode(false)
          setSelectedId(created.id)
          savedFormRef.current = snapshot
          markSaved()
          await fetchEstimates()
          onDocumentsChange?.()
        } else {
          setSaveState('idle')
          toast.error(result.error || 'Failed to create estimate')
        }
      } else if (selectedId) {
        const result = await updateEstimateAction({
          id: selectedId,
          clientId,
          companyId,
          title: editForm.title,
          description: editForm.description,
        })

        if (result.success) {
          savedFormRef.current = snapshot
          markSaved()
          await fetchEstimates()
          onDocumentsChange?.()
        } else {
          setSaveState('idle')
          toast.error(result.error || 'Failed to save estimate')
        }
      }
    } finally {
      isPersistingRef.current = false
    }
  }, [
    clientId,
    companyId,
    editForm,
    isCreateMode,
    selectedId,
    fetchEstimates,
    onDocumentsChange,
  ])

  useEffect(() => {
    if (!isEditorOpen) return
    if (selectedEstimate?.status === 'converted') return
    if (!editForm.title.trim()) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      persistEstimate()
    }, 800)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [editForm.title, editForm.description, isEditorOpen, isCreateMode, persistEstimate])

  const openCreate = () => {
    setIsCreateMode(true)
    setSelectedId(null)
    setEditForm({ title: '', description: '' })
    savedFormRef.current = ''
    setEditingLineId(null)
    setLineForm(emptyLineForm)
    setSaveState('idle')
    setIsEditorOpen(true)
  }

  const openEstimate = (estimate: Estimate) => {
    setIsCreateMode(false)
    setSelectedId(estimate.id)
    setEditForm({
      title: estimate.title,
      description: estimate.description || '',
    })
    savedFormRef.current = `${estimate.title}|||${estimate.description || ''}`
    setEditingLineId(null)
    setLineForm(emptyLineForm)
    setSaveState('idle')
    setIsEditorOpen(true)
  }

  const closeEditor = () => {
    setIsEditorOpen(false)
    setIsCreateMode(false)
    setSelectedId(null)
    setEditingLineId(null)
    setLineForm(emptyLineForm)
    setSaveState('idle')
  }

  const handleDeleteEstimate = async () => {
    if (!selectedEstimate) return
    if (!confirm(`Delete estimate "${selectedEstimate.title}"?`)) return
    const result = await deleteEstimateAction(selectedEstimate.id, clientId, companyId)
    if (result.success) {
      toast.success('Estimate deleted')
      closeEditor()
      await fetchEstimates()
      onDocumentsChange?.()
    } else {
      toast.error(result.error || 'Failed to delete estimate')
    }
  }

  const handleSetStatus = async (status: 'accepted' | 'declined' | 'sent') => {
    if (!selectedId) return
    const result = await setEstimateStatusAction({ id: selectedId, clientId, companyId, status })
    if (result.success) {
      const updated = await refreshSelected()
      if (updated) {
        setEditForm({
          title: updated.title,
          description: updated.description || '',
        })
      }
      onDocumentsChange?.()
    } else {
      toast.error(result.error || 'Failed to update status')
    }
  }

  const startEditLine = (item: EstimateLineItem) => {
    setEditingLineId(item.id)
    setLineForm({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unit_price),
    })
  }

  const cancelLineEdit = () => {
    setEditingLineId(null)
    setLineForm(emptyLineForm)
  }

  const handleSaveLine = async () => {
    if (!selectedId && isCreateMode) {
      await persistEstimate()
    }
    if (!selectedId) {
      toast.error('Add a title first — the estimate will save automatically')
      return
    }
    if (!lineForm.description.trim()) {
      toast.error('Description is required')
      return
    }
    const quantity = parseFloat(lineForm.quantity)
    const unitPrice = parseFloat(lineForm.unitPrice)
    if (!quantity || quantity <= 0 || isNaN(unitPrice) || unitPrice < 0) {
      toast.error('Enter valid quantity and unit price')
      return
    }

    setIsLineSaving(true)
    const payload = {
      estimateId: selectedId,
      clientId,
      companyId,
      description: lineForm.description,
      quantity,
      unitPrice,
    }

    const editingLine = selectedEstimate?.line_items?.find((l) => l.id === editingLineId)
    const result = editingLine
      ? await updateEstimateLineItemAction({ id: editingLine.id, ...payload })
      : await addEstimateLineItemAction(payload)

    if (result.success) {
      cancelLineEdit()
      const updated = await refreshSelected()
      if (updated) setSelectedId(updated.id)
      onDocumentsChange?.()
    } else {
      toast.error(result.error || 'Failed to save line item')
    }
    setIsLineSaving(false)
  }

  const handleDeleteLine = async (id: string) => {
    if (!selectedId) return
    if (!confirm('Delete this line item?')) return
    const result = await deleteEstimateLineItemAction(id, selectedId, clientId, companyId)
    if (result.success) {
      await refreshSelected()
      onDocumentsChange?.()
    } else {
      toast.error(result.error || 'Failed to delete line item')
    }
  }

  const getDocumentId = (estimate: Estimate | null): string | null => {
    if (!estimate) return null
    const doc = estimate.document
    if (!doc) return null
    if (Array.isArray(doc)) return doc[0]?.id ?? null
    return doc.id
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading estimates...</div>
  }

  const lineItems = selectedEstimate?.line_items || []
  const displayStatus = selectedEstimate?.status ?? (isCreateMode ? 'draft' : 'draft')
  const isConverted = displayStatus === 'converted'
  const linePreview = formatCurrency(calcPreview(lineForm.quantity, lineForm.unitPrice))

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <p className="text-sm text-muted-foreground">
          Changes save automatically. Status updates when you add line items.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          New Estimate
        </Button>
      </div>

      {estimates.length > 0 ? (
        <div className="scroll-fade border rounded-lg flex-1 min-h-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estimate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimates.map((estimate) => (
                <TableRow
                  key={estimate.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => openEstimate(estimate)}
                >
                  <TableCell>
                    <div className="font-medium">{estimate.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatEstimateNumber(estimate.id, estimate.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={estimate.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(estimate.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(estimate.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg">
          <p className="text-muted-foreground text-sm">No estimates yet. Create one to get started.</p>
        </div>
      )}

      <Dialog open={isEditorOpen} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="!max-w-2xl flex flex-col max-h-[90vh] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {isCreateMode ? 'New Estimate' : editForm.title || 'Estimate'}
                  {!isCreateMode && <StatusBadge status={displayStatus} />}
                </DialogTitle>
                {!isCreateMode && selectedEstimate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatEstimateNumber(selectedEstimate.id, selectedEstimate.created_at)}
                  </p>
                )}
              </div>
              <SaveIndicator state={saveState} />
            </div>
          </DialogHeader>

          <div className="scroll-fade flex-1 min-h-0 overflow-auto px-6 py-5 space-y-5">
            <div>
              <Label>Title *</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                disabled={isConverted}
                className="mt-1"
                placeholder="Kitchen remodel, lawn service..."
                autoFocus={isCreateMode}
              />
            </div>

            <div>
              <Label>Description</Label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                disabled={isConverted}
                className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                placeholder="Scope of work, notes for the client..."
              />
            </div>

            {!isCreateMode && !isConverted && ['sent', 'accepted', 'declined'].includes(displayStatus) && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Client response:</span>
                {displayStatus !== 'accepted' && (
                  <Button size="sm" variant="outline" onClick={() => handleSetStatus('accepted')}>
                    Mark Accepted
                  </Button>
                )}
                {displayStatus !== 'declined' && (
                  <Button size="sm" variant="outline" onClick={() => handleSetStatus('declined')}>
                    Mark Declined
                  </Button>
                )}
                {(displayStatus === 'accepted' || displayStatus === 'declined') && (
                  <Button size="sm" variant="ghost" onClick={() => handleSetStatus('sent')}>
                    Reset to Sent
                  </Button>
                )}
              </div>
            )}

            {!isCreateMode && (
              <section>
                <h4 className="font-medium mb-3">Line Items</h4>

                {lineItems.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right w-20">Qty</TableHead>
                          <TableHead className="text-right w-28">Unit</TableHead>
                          <TableHead className="text-right w-28">Amount</TableHead>
                          {!isConverted && <TableHead className="w-24" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((item) =>
                          editingLineId === item.id ? (
                            <LineItemEditRow
                              key={item.id}
                              lineForm={lineForm}
                              setLineForm={setLineForm}
                              linePreview={linePreview}
                              isSaving={isLineSaving}
                              onSave={handleSaveLine}
                              onCancel={cancelLineEdit}
                            />
                          ) : (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.description}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                              {!isConverted && (
                                <TableCell>
                                  <div className="flex justify-end gap-1">
                                    <Button variant="ghost" size="icon-xs" onClick={() => startEditLine(item)}>
                                      Edit
                                    </Button>
                                    <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteLine(item.id)}>
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          )
                        )}
                        <TableRow>
                          <TableCell colSpan={3} className="text-right font-medium">Total</TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {formatCurrency(selectedEstimate?.total ?? 0)}
                          </TableCell>
                          {!isConverted && <TableCell />}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="border border-dashed rounded-lg p-4 text-center text-sm text-muted-foreground">
                    Add line items to build the estimate — status will move to Sent automatically.
                  </div>
                )}

                {!isConverted && !editingLineId && (
                  <div className="mt-3 p-4 rounded-lg bg-muted/30 border border-dashed space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add line item</p>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      <div className="sm:col-span-5">
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={lineForm.description}
                          onChange={(e) => setLineForm({ ...lineForm, description: e.target.value })}
                          placeholder="Labor, materials..."
                          className="mt-1"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={lineForm.quantity}
                          onChange={(e) => setLineForm({ ...lineForm, quantity: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Unit price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={lineForm.unitPrice}
                          onChange={(e) => setLineForm({ ...lineForm, unitPrice: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div className="sm:col-span-3 flex items-center gap-2">
                        <span className="text-sm text-muted-foreground hidden sm:inline">{linePreview}</span>
                        <Button size="sm" onClick={handleSaveLine} disabled={isLineSaving} className="ml-auto">
                          <Plus className="size-4" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {isCreateMode && (
              <p className="text-sm text-muted-foreground">
                Start with a title — it saves automatically. Then add line items.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t shrink-0">
            <div className="flex flex-wrap gap-2">
              {!isConverted && !isCreateMode && (
                <Button size="sm" variant="destructive" onClick={handleDeleteEstimate}>
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              )}
              {getDocumentId(selectedEstimate) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `/api/documents/${getDocumentId(selectedEstimate)}/download`,
                      '_blank'
                    )
                  }
                >
                  <FileDown className="size-4" />
                  PDF
                </Button>
              )}
            </div>
            {!isConverted && selectedEstimate && (
              <Button
                size="sm"
                onClick={() => {
                  onConvertToJob(selectedEstimate)
                  closeEditor()
                }}
              >
                <ArrowRight className="size-4" />
                Convert to Job
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  return (
    <span
      className={`text-xs shrink-0 ${
        state === 'saving' ? 'text-muted-foreground' : 'text-green-600'
      }`}
    >
      {state === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}

function LineItemEditRow({
  lineForm,
  setLineForm,
  linePreview,
  isSaving,
  onSave,
  onCancel,
}: {
  lineForm: { description: string; quantity: string; unitPrice: string }
  setLineForm: (f: typeof lineForm) => void
  linePreview: string
  isSaving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell>
        <Input
          value={lineForm.description}
          onChange={(e) => setLineForm({ ...lineForm, description: e.target.value })}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={lineForm.quantity}
          onChange={(e) => setLineForm({ ...lineForm, quantity: e.target.value })}
          className="h-8 text-right"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={lineForm.unitPrice}
          onChange={(e) => setLineForm({ ...lineForm, unitPrice: e.target.value })}
          className="h-8 text-right"
        />
      </TableCell>
      <TableCell className="text-right text-sm text-muted-foreground">{linePreview}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-xs" onClick={onSave} disabled={isSaving}>
            <Check className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onCancel}>
            <X className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function StatusBadge({ status }: { status: EstimateStatus }) {
  const variants: Record<EstimateStatus, string> = {
    draft: 'bg-muted text-muted-foreground',
    sent: 'bg-blue-50 text-blue-700 border-blue-200',
    accepted: 'bg-green-50 text-green-700 border-green-200',
    declined: 'bg-red-50 text-red-700 border-red-200',
    converted: 'bg-purple-50 text-purple-700 border-purple-200',
  }
  return (
    <Badge variant="outline" className={variants[status]}>
      {ESTIMATE_STATUS_LABELS[status]}
    </Badge>
  )
}