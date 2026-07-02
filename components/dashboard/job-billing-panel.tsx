'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getJobBillingAction,
  addBillingLineItemAction,
  updateBillingLineItemAction,
  deleteBillingLineItemAction,
  addBillingPaymentAction,
  deleteBillingPaymentAction,
} from '@/app/action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatCurrency,
  PAYMENT_METHODS,
  type JobBillingData,
  type BillingLineItem,
} from '@/lib/billing'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Banknote, Trash2, User, X, Check } from 'lucide-react'

interface JobBillingPanelProps {
  scheduleId: string
  clientId: string
}

export function JobBillingPanel({ scheduleId, clientId }: JobBillingPanelProps) {
  const supabase = createClient()

  const [billing, setBilling] = useState<JobBillingData | null>(null)
  const [companyId, setCompanyId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [lineForm, setLineForm] = useState({
    description: '',
    quantity: '1',
    unitPrice: '',
  })

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    method: 'cash',
    notes: '',
  })

  const fetchBilling = useCallback(async () => {
    const result = await getJobBillingAction(scheduleId, clientId)
    if (result.success && result.billing) {
      setBilling(result.billing as JobBillingData)
    } else {
      toast.error(result.error || 'Failed to load billing')
    }
    setIsLoading(false)
  }, [scheduleId, clientId])

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
      await fetchBilling()
    }
    load()
  }, [supabase, fetchBilling])

  const cancelLineEdit = () => {
    setEditingLineId(null)
    setLineForm({ description: '', quantity: '1', unitPrice: '' })
  }

  const openEditLine = (item: BillingLineItem) => {
    setEditingLineId(item.id)
    setLineForm({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unit_price),
    })
  }

  const openAddFromJobPrice = () => {
    if (!billing?.listPrice) return
    setEditingLineId(null)
    setLineForm({
      description: billing.title,
      quantity: '1',
      unitPrice: String(billing.listPrice),
    })
  }

  const handleSaveLine = async () => {
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

    setIsSaving(true)

    const payload = {
      scheduleId,
      clientId,
      companyId,
      description: lineForm.description,
      quantity,
      unitPrice,
    }

    const editingLine = billing?.lineItems.find((l) => l.id === editingLineId)
    const result = editingLine
      ? await updateBillingLineItemAction({ id: editingLine.id, ...payload })
      : await addBillingLineItemAction(payload)

    if (result.success) {
      toast.success(editingLine ? 'Line item updated' : 'Line item added')
      cancelLineEdit()
      await fetchBilling()
    } else {
      toast.error(result.error || 'Failed to save line item')
    }

    setIsSaving(false)
  }

  const handleDeleteLine = async (id: string) => {
    if (!confirm('Delete this line item?')) return
    const result = await deleteBillingLineItemAction(id, scheduleId, clientId, companyId)
    if (result.success) {
      toast.success('Line item deleted')
      await fetchBilling()
    } else {
      toast.error(result.error || 'Failed to delete line item')
    }
  }

  const openRecordCash = () => {
    setPaymentForm({
      amount: billing?.summary.balanceDue ? String(billing.summary.balanceDue) : '',
      paymentDate: new Date().toISOString().slice(0, 10),
      method: 'cash',
      notes: '',
    })
    setShowPaymentForm(true)
  }

  const handleSavePayment = async () => {
    const amount = parseFloat(paymentForm.amount)
    if (!amount || amount <= 0) {
      toast.error('Enter a valid payment amount')
      return
    }

    setIsSaving(true)

    const result = await addBillingPaymentAction({
      scheduleId,
      clientId,
      companyId,
      amount,
      paymentDate: paymentForm.paymentDate,
      method: paymentForm.method,
      notes: paymentForm.notes,
    })

    if (result.success) {
      toast.success('Payment recorded')
      setShowPaymentForm(false)
      await fetchBilling()
    } else {
      toast.error(result.error || 'Failed to record payment')
    }

    setIsSaving(false)
  }

  const handleDeletePayment = async (id: string, source?: string) => {
    if (source === 'stripe') {
      toast.error('Client portal payments cannot be deleted here')
      return
    }
    if (!confirm('Delete this payment?')) return
    const result = await deleteBillingPaymentAction(id, scheduleId, clientId, companyId)
    if (result.success) {
      toast.success('Payment deleted')
      await fetchBilling()
    } else {
      toast.error(result.error || 'Failed to delete payment')
    }
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading billing...</div>
  }

  if (!billing) {
    return <div className="text-sm text-muted-foreground">Unable to load billing data.</div>
  }

  const { summary } = billing
  const linePreview = formatCurrency(calcPreview(lineForm.quantity, lineForm.unitPrice))
  const ownerPaymentMethods = PAYMENT_METHODS.filter((m) =>
    ['cash', 'check', 'other'].includes(m.value)
  )

  return (
    <div className="flex flex-col gap-6 flex-1 min-h-0">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Charged" value={formatCurrency(summary.totalCharged)} />
        <SummaryCard label="Total Paid" value={formatCurrency(summary.totalPaid)} />
        <SummaryCard
          label="Balance Due"
          value={formatCurrency(summary.balanceDue)}
          highlight={summary.balanceDue > 0}
        />
      </div>

      {summary.balanceDue > 0 && billing.lineItems.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <User className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">Awaiting client payment</p>
            <p className="text-muted-foreground mt-0.5">
              The client will pay this balance through the client portal. Use Record Cash Payment
              below if they paid with cash or check in person.
            </p>
          </div>
        </div>
      )}

      <div className="scroll-fade flex-1 min-h-0 flex flex-col gap-6 overflow-auto">
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-lg">Line Items</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recurring jobs copy charges automatically — edit any item as needed.
              </p>
            </div>
            <div className="flex gap-2">
              {billing.listPrice > 0 && billing.lineItems.length === 0 && (
                <Button variant="outline" size="sm" onClick={openAddFromJobPrice}>
                  Use Job Price ({formatCurrency(billing.listPrice)})
                </Button>
              )}
              <Button size="sm" onClick={cancelLineEdit}>+ Add Line Item</Button>
            </div>
          </div>

          {billing.lineItems.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billing.lineItems.map((item) =>
                    editingLineId === item.id ? (
                      <TableRow key={item.id} className="bg-muted/30">
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
                            <Button variant="ghost" size="icon-xs" onClick={handleSaveLine} disabled={isSaving}>
                              <Check className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon-xs" onClick={cancelLineEdit}>
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon-xs" onClick={() => openEditLine(item)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteLine(item.id)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  )}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-medium">Subtotal</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(summary.totalCharged)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm">
              No line items yet. Set a job price when creating the job, or add charges below.
            </div>
          )}

          {!editingLineId && (
            <div className="mt-3 p-4 rounded-lg bg-muted/30 border border-dashed space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add line item</p>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-5">
                  <Label className="text-xs">Description</Label>
                  <Input
                    value={lineForm.description}
                    onChange={(e) => setLineForm({ ...lineForm, description: e.target.value })}
                    placeholder="Labor, parts..."
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min="0.01"
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
                  <Button size="sm" onClick={handleSaveLine} disabled={isSaving} className="ml-auto">
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-lg">Payments</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Client portal and Stripe payments appear here automatically.
              </p>
            </div>
            {summary.balanceDue > 0 && (
              <Button
                size="sm"
                variant={showPaymentForm ? 'secondary' : 'outline'}
                onClick={() => (showPaymentForm ? setShowPaymentForm(false) : openRecordCash())}
              >
                <Banknote className="size-4" />
                {showPaymentForm ? 'Cancel' : 'Record Cash Payment'}
              </Button>
            )}
          </div>

          {billing.payments.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billing.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {new Date(payment.payment_date + 'T00:00:00').toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 capitalize">
                          {payment.method}
                          {payment.source === 'stripe' && (
                            <Badge variant="secondary" className="text-[10px]">Client Portal</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payment.notes || '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>
                        {payment.source !== 'stripe' && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleDeletePayment(payment.id, payment.source)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-medium">Total Paid</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      {formatCurrency(summary.totalPaid)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm">
              No payments yet. The client will pay via the client portal, or record cash/check payments here.
            </div>
          )}

          {showPaymentForm && (
            <div className="mt-3 p-4 rounded-lg bg-muted/30 border border-dashed space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Record cash payment
              </p>
              <p className="text-sm text-muted-foreground">
                Use when the client paid in person with cash or check.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Amount *</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Payment date</Label>
                  <Input
                    type="date"
                    value={paymentForm.paymentDate}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Method</Label>
                  <Select
                    value={paymentForm.method}
                    onValueChange={(value) => setPaymentForm({ ...paymentForm, method: value ?? 'cash' })}
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ownerPaymentMethods.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    placeholder="Check #, who collected..."
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowPaymentForm(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSavePayment} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Record Payment'}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight mt-1 ${highlight ? 'text-orange-600' : ''}`}>
        {value}
      </div>
    </div>
  )
}

function calcPreview(quantity: string, unitPrice: string): number {
  const q = parseFloat(quantity)
  const p = parseFloat(unitPrice)
  if (isNaN(q) || isNaN(p)) return 0
  return Math.round(q * p * 100) / 100
}