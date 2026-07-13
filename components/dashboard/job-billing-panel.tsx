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
  sendJobInvoiceAction,
  generateJobInvoiceAction,
} from '@/app/action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
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
import { DocumentViewerDialog } from '@/components/dashboard/document-viewer-dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MobileListCard, MobileListCardRow } from '@/components/ui/mobile-list-card'
import {
  MOBILE_LIST_STACK_CLASS,
  MOBILE_NATURAL_HEIGHT_CLASS,
  MOBILE_SCROLL_VIEWPORT_CLASS,
  MOBILE_TABLE_DESKTOP_ONLY_CLASS,
  MOBILE_TOOLBAR_ROW_CLASS,
} from '@/lib/mobile-layout'
import { toast } from 'sonner'
import Link from 'next/link'
import { Banknote, Copy, ExternalLink, FileText, Loader2, Mail, Trash2, User, X, Check } from 'lucide-react'

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
  const [isSendingInvoice, setIsSendingInvoice] = useState(false)
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false)
  const [invoiceViewerOpen, setInvoiceViewerOpen] = useState(false)

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

  const copyPaymentLink = async () => {
    const url = `${window.location.origin}/portal/jobs/${scheduleId}?pay=1`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Payment link copied — send it to your client')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const handleCreateInvoice = async () => {
    setIsGeneratingInvoice(true)
    const result = await generateJobInvoiceAction(scheduleId, clientId)
    if (result.success) {
      toast.success('Invoice created — view it on the Documents tab')
      await fetchBilling()
    } else {
      toast.error(result.error || 'Failed to create invoice')
    }
    setIsGeneratingInvoice(false)
  }

  const handleSendInvoice = async () => {
    setIsSendingInvoice(true)
    const result = await sendJobInvoiceAction(scheduleId, clientId)
    if (result.success) {
      toast.success('Invoice sent to client')
      await fetchBilling()
    } else {
      toast.error(result.error || 'Failed to send invoice')
    }
    setIsSendingInvoice(false)
  }

  const handleSavePayment = async () => {
    const amount = parseFloat(paymentForm.amount)
    if (!amount || amount <= 0) {
      toast.error('Enter a valid payment amount')
      return
    }

    if (billing && amount > billing.summary.balanceDue + 0.009) {
      toast.error(`Payment cannot exceed ${formatCurrency(billing.summary.balanceDue)}`)
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
    <div className={`flex flex-col gap-6 flex-1 min-h-0 ${MOBILE_NATURAL_HEIGHT_CLASS}`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Charged" value={formatCurrency(summary.totalCharged)} />
        <SummaryCard label="Total Paid" value={formatCurrency(summary.totalPaid)} />
        <SummaryCard
          label="Balance Due"
          value={formatCurrency(summary.balanceDue)}
          highlight={summary.balanceDue > 0}
        />
      </div>

      {billing.lineItems.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <User className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {summary.balanceDue > 0
                    ? `Balance due: ${formatCurrency(summary.balanceDue)}`
                    : 'Paid in full'}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  The invoice PDF lives on the Documents tab under Invoices. Send notifies your
                  client; payment links work when a balance is due.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => void handleCreateInvoice()}
                disabled={isGeneratingInvoice}
              >
                {isGeneratingInvoice ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileText className="size-4" />
                )}
                {isGeneratingInvoice ? 'Creating…' : 'Create invoice'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSendInvoice}
                disabled={isSendingInvoice}
              >
                <Mail className="size-4" />
                {isSendingInvoice ? 'Sending…' : 'Send invoice'}
              </Button>
              {billing.invoiceDocument && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setInvoiceViewerOpen(true)}
                >
                  <ExternalLink className="size-4" />
                  View PDF
                </Button>
              )}
              {summary.balanceDue > 0 && (
                <Button size="sm" variant="outline" onClick={copyPaymentLink}>
                  <Copy className="size-4" />
                  Copy payment link
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <ScrollArea
        className={`flex-1 min-h-0 ${MOBILE_NATURAL_HEIGHT_CLASS}`}
        viewportClassName={`scroll-fade ${MOBILE_SCROLL_VIEWPORT_CLASS}`}
      >
        <div className="flex flex-col gap-6">
        <section>
          <div className={`mb-3 ${MOBILE_TOOLBAR_ROW_CLASS}`}>
            <div className="min-w-0">
              <h3 className="font-semibold text-lg">Line Items</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recurring jobs copy charges automatically — edit any item as needed.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 max-md:w-full max-md:[&_button]:flex-1">
              {billing.listPrice > 0 && billing.lineItems.length === 0 && (
                <Button variant="outline" size="sm" onClick={openAddFromJobPrice}>
                  Use Job Price ({formatCurrency(billing.listPrice)})
                </Button>
              )}
              <Button size="sm" onClick={cancelLineEdit}>+ Add Line Item</Button>
            </div>
          </div>

          {billing.lineItems.length > 0 ? (
            <>
            <div className={`border rounded-lg ${MOBILE_TABLE_DESKTOP_ONLY_CLASS}`}>
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

            <div className={MOBILE_LIST_STACK_CLASS}>
              {billing.lineItems.map((item) =>
                editingLineId === item.id ? (
                  <MobileListCard key={item.id}>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={lineForm.description}
                          onChange={(e) =>
                            setLineForm({ ...lineForm, description: e.target.value })
                          }
                          className="mt-1"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Qty</Label>
                          <Input
                            type="number"
                            value={lineForm.quantity}
                            onChange={(e) =>
                              setLineForm({ ...lineForm, quantity: e.target.value })
                            }
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Unit price</Label>
                          <Input
                            type="number"
                            value={lineForm.unitPrice}
                            onChange={(e) =>
                              setLineForm({ ...lineForm, unitPrice: e.target.value })
                            }
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <MobileListCardRow label="Amount" value={linePreview} />
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={cancelLineEdit}>
                          <X className="size-4" />
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveLine} disabled={isSaving}>
                          <Check className="size-4" />
                          Save
                        </Button>
                      </div>
                    </div>
                  </MobileListCard>
                ) : (
                  <MobileListCard key={item.id}>
                    <div className="space-y-2">
                      <p className="font-medium leading-snug">{item.description}</p>
                      <MobileListCardRow label="Qty" value={item.quantity} />
                      <MobileListCardRow
                        label="Unit"
                        value={formatCurrency(item.unit_price)}
                      />
                      <MobileListCardRow label="Amount" value={formatCurrency(item.amount)} />
                      <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditLine(item)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleDeleteLine(item.id)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </MobileListCard>
                )
              )}
              <MobileListCard>
                <MobileListCardRow
                  label="Subtotal"
                  value={
                    <span className="font-semibold">
                      {formatCurrency(summary.totalCharged)}
                    </span>
                  }
                />
              </MobileListCard>
            </div>
            </>
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
          <div className={`mb-3 ${MOBILE_TOOLBAR_ROW_CLASS}`}>
            <div className="min-w-0">
              <h3 className="font-semibold text-lg">Payments</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Client portal and Stripe payments appear here automatically.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:[&_button]:flex-1">
              <Link
                href="/dashboard/payments"
                className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                All transactions
                <ExternalLink className="size-3.5" />
              </Link>
              {summary.balanceDue > 0 && (
                <Button
                  size="sm"
                  variant={showPaymentForm ? 'secondary' : 'outline'}
                  onClick={() => (showPaymentForm ? setShowPaymentForm(false) : openRecordCash())}
                >
                  <Banknote className="size-4" />
                  {showPaymentForm ? 'Cancel' : 'Record payment'}
                </Button>
              )}
            </div>
          </div>

          {billing.payments.length > 0 ? (
            <>
            <div className={`border rounded-lg ${MOBILE_TABLE_DESKTOP_ONLY_CLASS}`}>
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

            <div className={MOBILE_LIST_STACK_CLASS}>
              {billing.payments.map((payment) => (
                <MobileListCard key={payment.id}>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium capitalize">{payment.method}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(payment.payment_date + 'T00:00:00').toLocaleDateString()}
                        </p>
                      </div>
                      {payment.source === 'stripe' ? (
                        <Badge variant="secondary">Client Portal</Badge>
                      ) : null}
                    </div>
                    <MobileListCardRow
                      label="Amount"
                      value={formatCurrency(payment.amount)}
                    />
                    {payment.notes ? (
                      <MobileListCardRow label="Notes" value={payment.notes} />
                    ) : null}
                    {payment.source !== 'stripe' ? (
                      <div className="flex justify-end pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleDeletePayment(payment.id, payment.source)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </MobileListCard>
              ))}
              <MobileListCard>
                <MobileListCardRow
                  label="Total paid"
                  value={
                    <span className="font-semibold text-green-600">
                      {formatCurrency(summary.totalPaid)}
                    </span>
                  }
                />
              </MobileListCard>
            </div>
            </>
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
                Record cash, check, or other in-person payments. Partial payments are fine — up to{' '}
                <span className="font-medium text-foreground">{formatCurrency(summary.balanceDue)}</span>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Amount *</Label>
                  <Input
                    type="number"
                    min="0.01"
                    max={summary.balanceDue}
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className="mt-1"
                  />
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground mt-1 underline underline-offset-2"
                    onClick={() =>
                      setPaymentForm({ ...paymentForm, amount: String(summary.balanceDue) })
                    }
                  >
                    Fill full balance ({formatCurrency(summary.balanceDue)})
                  </button>
                </div>
                <div>
                  <Label className="text-xs">Payment date</Label>
                  <DatePicker
                    value={paymentForm.paymentDate}
                    onChange={(value) => setPaymentForm({ ...paymentForm, paymentDate: value })}
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
      </ScrollArea>

      {billing.invoiceDocument && (
        <DocumentViewerDialog
          document={{
            id: billing.invoiceDocument.id,
            name: billing.invoiceDocument.name,
            file_name: billing.invoiceDocument.name,
            file_type: 'application/pdf',
            notes: null,
          }}
          open={invoiceViewerOpen}
          onOpenChange={setInvoiceViewerOpen}
        />
      )}
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