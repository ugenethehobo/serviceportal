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
  relinkBillingPaymentInstallmentAction,
} from '@/app/action'
import { JobPaymentPlanEditor } from '@/components/dashboard/job-payment-plan-editor'
import { StripeConnectAlert } from '@/components/dashboard/stripe-connect-gate'
import { MainPageCard } from '@/components/ui/main-page-card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { formatInstallmentStatusLabel } from '@/lib/payment-plans'
import {
  MOBILE_FULL_WIDTH_BUTTON_CLASS,
  MOBILE_LIST_STACK_CLASS,
  MOBILE_NATURAL_HEIGHT_CLASS,
  MOBILE_SCROLL_VIEWPORT_CLASS,
  MOBILE_SELECT_TRIGGER_CLASS,
  MOBILE_TABLE_DESKTOP_ONLY_CLASS,
  MOBILE_TOOLBAR_ROW_CLASS,
} from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'
import { DocumentViewerDialog } from '@/components/dashboard/document-viewer-dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MobileListCard, MobileListCardRow } from '@/components/ui/mobile-list-card'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  AlertTriangle,
  Banknote,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Trash2,
  User,
  X,
  Check,
} from 'lucide-react'

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
  const [showPlanEditor, setShowPlanEditor] = useState(false)
  const [fifoBanner, setFifoBanner] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingInvoice, setIsSendingInvoice] = useState(false)
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false)
  const [invoiceViewerOpen, setInvoiceViewerOpen] = useState(false)
  const [relinkingPaymentId, setRelinkingPaymentId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<
    null | { kind: 'line'; id: string } | { kind: 'payment'; id: string }
  >(null)
  const [isDeleting, setIsDeleting] = useState(false)

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
    installmentId: '',
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

  const requestDeleteLine = (id: string) => {
    setPendingDelete({ kind: 'line', id })
  }

  const requestDeletePayment = (id: string, source?: string) => {
    if (source === 'stripe') {
      toast.error('Client portal payments cannot be deleted here')
      return
    }
    setPendingDelete({ kind: 'payment', id })
  }

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return
    setIsDeleting(true)
    if (pendingDelete.kind === 'line') {
      const result = await deleteBillingLineItemAction(
        pendingDelete.id,
        scheduleId,
        clientId,
        companyId
      )
      if (result.success) {
        toast.success('Line item deleted')
        await fetchBilling()
      } else {
        toast.error(result.error || 'Failed to delete line item')
      }
    } else {
      const result = await deleteBillingPaymentAction(
        pendingDelete.id,
        scheduleId,
        clientId,
        companyId
      )
      if (result.success) {
        toast.success('Payment deleted')
        await fetchBilling()
      } else {
        toast.error(result.error || 'Failed to delete payment')
      }
    }
    setIsDeleting(false)
    setPendingDelete(null)
  }

  const openRecordCash = () => {
    const dueNow = billing?.amountDueNow
    const balance = billing?.summary.balanceDue
    const defaultAmount =
      dueNow != null && dueNow > 0
        ? String(dueNow)
        : balance
          ? String(balance)
          : ''
    const nextInstallment =
      billing?.paymentPlan?.installments.find(
        (i) => i.status !== 'paid' && i.status !== 'superseded' && i.remaining > 0
      ) || null
    setPaymentForm({
      amount: defaultAmount,
      paymentDate: new Date().toISOString().slice(0, 10),
      method: 'cash',
      notes: '',
      installmentId: nextInstallment?.id || '',
    })
    setShowPaymentForm(true)
  }

  const handleRelinkPayment = async (paymentId: string, installmentId: string | null) => {
    setRelinkingPaymentId(paymentId)
    const result = await relinkBillingPaymentInstallmentAction({
      paymentId,
      scheduleId,
      clientId,
      companyId,
      installmentId,
    })
    if (result.success) {
      toast.success(installmentId ? 'Payment linked to installment' : 'Payment unlinked')
      await fetchBilling()
    } else {
      toast.error(result.error || 'Could not update payment link')
    }
    setRelinkingPaymentId(null)
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
      installmentId: paymentForm.installmentId || undefined,
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
  const plan = billing.paymentPlan
  const openInstallments =
    plan?.installments.filter((i) => i.status !== 'superseded') || []
  const installmentLabelById = new Map(
    (plan?.installments || []).map((i) => [i.id, i.label])
  )
  const installmentSelectLabel = (installmentId: string | null | undefined) => {
    if (!installmentId) return 'Auto (FIFO)'
    return installmentLabelById.get(installmentId) || 'Linked installment'
  }
  const paymentFormInstallmentLabel = (() => {
    if (!paymentForm.installmentId) return 'Auto (FIFO order)'
    const inst = openInstallments.find((i) => i.id === paymentForm.installmentId)
    if (!inst) return installmentSelectLabel(paymentForm.installmentId)
    return `${inst.label} · ${formatCurrency(inst.remaining)} left`
  })()
  const methodLabel = (method: string) => {
    if (method === 'card') return 'Card'
    return PAYMENT_METHODS.find((m) => m.value === method)?.label || method
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-4',
        MOBILE_NATURAL_HEIGHT_CLASS
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        {/* Left: overview — page-level surface (not nested in MainPageCard) */}
        <MainPageCard className="gap-3 overflow-y-auto p-3 sm:p-4 lg:min-h-0">
          <StripeConnectAlert />

          <div className="grid grid-cols-3 gap-2">
            <SummaryCard label="Charged" value={formatCurrency(summary.totalCharged)} />
            <SummaryCard label="Paid" value={formatCurrency(summary.totalPaid)} />
            <SummaryCard
              label="Balance"
              value={formatCurrency(summary.balanceDue)}
              highlight={summary.balanceDue > 0}
            />
          </div>

          {(plan?.needsAttention || fifoBanner) && (
            <div className="flex flex-col gap-2">
              {plan?.needsAttention && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <div>
                    <p className="font-medium">Plan needs attention</p>
                    <p className="mt-0.5 text-amber-900/80 dark:text-amber-100/80">
                      {plan.needsAttentionReason ||
                        'Installment amounts may not match the job total.'}
                    </p>
                  </div>
                </div>
              )}
              {fifoBanner && (
                <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <div>
                    <p className="font-medium">Payments re-allocated</p>
                    <p className="mt-0.5 text-sky-900/80 dark:text-sky-100/80">
                      Existing payments were applied oldest-first. Re-link below if needed.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <section className="space-y-2.5 rounded-lg border p-3">
        <div className={MOBILE_TOOLBAR_ROW_CLASS}>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Payment plan</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {plan
                ? plan.planType === 'deposit_remainder'
                  ? 'Deposit + remainder'
                  : plan.planType === 'custom_installments'
                    ? 'Custom installments'
                    : 'Full balance'
                : 'Full remaining balance when billable'}
              {billing.amountDueNow != null && billing.amountDueNow > 0
                ? ` · Due now ${formatCurrency(billing.amountDueNow)}`
                : ''}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className={cn('shrink-0', MOBILE_FULL_WIDTH_BUTTON_CLASS)}
            onClick={() => setShowPlanEditor(true)}
          >
            {plan ? 'Edit…' : 'Set plan…'}
          </Button>
        </div>

        {openInstallments.length > 0 ? (
          <div className="space-y-2">
            {openInstallments.map((inst) => (
              <div
                key={inst.id}
                className="rounded-md border bg-background/80 px-2.5 py-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm leading-snug">{inst.label}</p>
                    {inst.collectibleNow ? (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        Collectible
                      </Badge>
                    ) : null}
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {formatInstallmentStatusLabel(inst.status)}
                  </Badge>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-muted-foreground">
                  <span>
                    Due{' '}
                    {inst.dueDate
                      ? new Date(inst.dueDate + 'T00:00:00').toLocaleDateString()
                      : '—'}
                  </span>
                  <span className="text-right tabular-nums">
                    {formatCurrency(inst.amountDue)}
                  </span>
                  <span>Paid {formatCurrency(inst.amountPaid)}</span>
                  <span className="text-right font-medium text-foreground tabular-nums">
                    {formatCurrency(inst.remaining)} left
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Optional deposit or installments so clients can pay before the visit.
          </p>
        )}
          </section>

          {billing.lineItems.length > 0 && (
            <div className="space-y-2.5 rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex items-start gap-2">
                <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {summary.balanceDue > 0
                      ? `Balance due: ${formatCurrency(summary.balanceDue)}`
                      : 'Paid in full'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Invoice PDF is on Documents. Payment links work when balance is due.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Button
                  size="sm"
                  className="w-full justify-start"
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
                  className="w-full justify-start"
                  onClick={() => void handleSendInvoice()}
                  disabled={isSendingInvoice}
                >
                  <Mail className="size-4" />
                  {isSendingInvoice ? 'Sending…' : 'Send invoice'}
                </Button>
                {billing.invoiceDocument && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setInvoiceViewerOpen(true)}
                  >
                    <ExternalLink className="size-4" />
                    View PDF
                  </Button>
                )}
                {summary.balanceDue > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => void copyPaymentLink()}
                  >
                    <Copy className="size-4" />
                    Copy payment link
                  </Button>
                )}
              </div>
            </div>
          )}
        </MainPageCard>

        {/* Right: line items + payments — page-level surface */}
        <MainPageCard className="min-h-0 overflow-hidden p-0">
      <ScrollArea
        className={cn('min-h-0 flex-1', MOBILE_NATURAL_HEIGHT_CLASS)}
        viewportClassName={cn('scroll-fade p-4', MOBILE_SCROLL_VIEWPORT_CLASS)}
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
                            <Button variant="ghost" size="icon-xs" onClick={() => requestDeleteLine(item.id)}>
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
                          onClick={() => requestDeleteLine(item.id)}
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
                    <TableHead>Installment</TableHead>
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
                        <div className="flex items-center gap-2">
                          {methodLabel(payment.method)}
                          {payment.source === 'stripe' && (
                            <Badge variant="secondary" className="text-[10px]">Client Portal</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {openInstallments.length > 0 || payment.installment_id ? (
                          <Select
                            value={payment.installment_id || '__fifo__'}
                            disabled={relinkingPaymentId === payment.id}
                            onValueChange={(value) => {
                              const next = value === '__fifo__' || !value ? null : value
                              void handleRelinkPayment(payment.id, next)
                            }}
                          >
                            <SelectTrigger className="h-8 min-w-[10rem] max-w-[14rem]">
                              <SelectValue>
                                {installmentSelectLabel(payment.installment_id)}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                              <SelectItem value="__fifo__">Auto (FIFO)</SelectItem>
                              {openInstallments.map((inst) => (
                                <SelectItem key={inst.id} value={inst.id}>
                                  {inst.label}
                                </SelectItem>
                              ))}
                              {payment.installment_id &&
                              !openInstallments.some((i) => i.id === payment.installment_id) ? (
                                <SelectItem value={payment.installment_id}>
                                  {installmentSelectLabel(payment.installment_id)} (unavailable)
                                </SelectItem>
                              ) : null}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
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
                            onClick={() => requestDeletePayment(payment.id, payment.source)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-medium">Total Paid</TableCell>
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
                      <div className="min-w-0">
                        <p className="font-medium">{methodLabel(payment.method)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
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
                    {openInstallments.length > 0 || payment.installment_id ? (
                      <div className="min-w-0">
                        <Label className="text-xs text-muted-foreground">Installment</Label>
                        <Select
                          value={payment.installment_id || '__fifo__'}
                          disabled={relinkingPaymentId === payment.id}
                          onValueChange={(value) => {
                            const next = value === '__fifo__' || !value ? null : value
                            void handleRelinkPayment(payment.id, next)
                          }}
                        >
                          <SelectTrigger
                            className={cn('mt-1 w-full', MOBILE_SELECT_TRIGGER_CLASS)}
                          >
                            <SelectValue>
                              {installmentSelectLabel(payment.installment_id)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            <SelectItem value="__fifo__">Auto (FIFO)</SelectItem>
                            {openInstallments.map((inst) => (
                              <SelectItem key={inst.id} value={inst.id}>
                                {inst.label}
                              </SelectItem>
                            ))}
                            {payment.installment_id &&
                            !openInstallments.some((i) => i.id === payment.installment_id) ? (
                              <SelectItem value={payment.installment_id}>
                                {installmentSelectLabel(payment.installment_id)} (unavailable)
                              </SelectItem>
                            ) : null}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    {payment.notes ? (
                      <MobileListCardRow label="Notes" value={payment.notes} />
                    ) : null}
                    {payment.source !== 'stripe' ? (
                      <div className="flex justify-end pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => requestDeletePayment(payment.id, payment.source)}
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
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto px-0 text-xs"
                    onClick={() =>
                      setPaymentForm({ ...paymentForm, amount: String(summary.balanceDue) })
                    }
                  >
                    Fill full balance ({formatCurrency(summary.balanceDue)})
                  </Button>
                </div>
                <div className="min-w-0">
                  <Label className="text-xs">Payment date</Label>
                  <DatePicker
                    value={paymentForm.paymentDate}
                    onChange={(value) => setPaymentForm({ ...paymentForm, paymentDate: value })}
                    className="mt-1"
                  />
                </div>
                <div className="min-w-0">
                  <Label className="text-xs">Method</Label>
                  <Select
                    value={paymentForm.method}
                    onValueChange={(value) => setPaymentForm({ ...paymentForm, method: value ?? 'cash' })}
                  >
                    <SelectTrigger className={cn('mt-1 w-full', MOBILE_SELECT_TRIGGER_CLASS)}>
                      <SelectValue>
                        {methodLabel(paymentForm.method)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      {ownerPaymentMethods.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0">
                  <Label className="text-xs">Notes</Label>
                  <Input
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    placeholder="Check #, who collected..."
                    className="mt-1"
                  />
                </div>
                {openInstallments.length > 0 && (
                  <div className="min-w-0 sm:col-span-2">
                    <Label className="text-xs">Apply to installment (optional)</Label>
                    <Select
                      value={paymentForm.installmentId || '__fifo__'}
                      onValueChange={(value) =>
                        setPaymentForm({
                          ...paymentForm,
                          installmentId: value === '__fifo__' || !value ? '' : value,
                        })
                      }
                    >
                      <SelectTrigger className={cn('mt-1 w-full', MOBILE_SELECT_TRIGGER_CLASS)}>
                        <SelectValue>{paymentFormInstallmentLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectItem value="__fifo__">Auto (FIFO order)</SelectItem>
                        {openInstallments.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.label} · {formatCurrency(inst.remaining)} left
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className={MOBILE_FULL_WIDTH_BUTTON_CLASS}
                  onClick={() => setShowPaymentForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className={MOBILE_FULL_WIDTH_BUTTON_CLASS}
                  onClick={handleSavePayment}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Record Payment'}
                </Button>
              </div>
            </div>
          )}
        </section>
        </div>
      </ScrollArea>
        </MainPageCard>
      </div>

      <JobPaymentPlanEditor
        open={showPlanEditor}
        onOpenChange={setShowPlanEditor}
        scheduleId={scheduleId}
        clientId={clientId}
        companyId={companyId}
        previewTotal={summary.totalCharged || billing.listPrice || 1000}
        paymentPlan={plan || null}
        isRecurring={Boolean(billing.recurringRuleId)}
        hasPayments={billing.payments.length > 0}
        onSaved={({ allocatedExistingPayments }) => {
          if (allocatedExistingPayments) setFifoBanner(true)
          void fetchBilling()
        }}
      />

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

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDelete(null)
        }}
      >
        <AlertDialogContent size="default">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.kind === 'payment' ? 'Delete payment?' : 'Delete line item?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === 'payment'
                ? 'This removes the payment from the job ledger. This cannot be undone.'
                : 'This removes the charge from the job. Payment plan amounts may rebalance.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmPendingDelete()
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
    <div className="rounded-lg border bg-muted/20 px-2 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-sm font-semibold tracking-tight tabular-nums sm:text-base',
          highlight && 'text-orange-600'
        )}
      >
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