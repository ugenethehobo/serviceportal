'use client'

import { useEffect, useState } from 'react'
import {
  resetJobPaymentPlanAction,
  setJobPaymentPlanAction,
} from '@/app/action'
import { PaymentPlanTemplateFields } from '@/components/dashboard/payment-plan-template-fields'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  DEFAULT_FULL_BALANCE_TEMPLATE,
  formatAllFutureApplyToast,
  type JobPaymentPlanTemplate,
  type PlanProgressSummary,
} from '@/lib/payment-plans'
import {
  MOBILE_FULL_WIDTH_BUTTON_CLASS,
  SCROLLABLE_MODAL_BODY_CLASS,
  SCROLLABLE_MODAL_HEADER_CLASS,
  SCROLLABLE_MODAL_SHELL_LG,
} from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  scheduleId: string
  clientId: string
  companyId: string
  /** Sample total for template preview. */
  previewTotal: number
  /** Existing plan progress (if any) for initial template shape. */
  paymentPlan: PlanProgressSummary | null
  /** Job is part of a recurring series. */
  isRecurring?: boolean
  /** Whether this job already has payments (show reallocate note). */
  hasPayments: boolean
  onSaved: (result: { allocatedExistingPayments?: boolean }) => void
}

function templateFromProgress(plan: PlanProgressSummary | null): JobPaymentPlanTemplate {
  if (!plan) return { ...DEFAULT_FULL_BALANCE_TEMPLATE }
  if (plan.planType === 'deposit_remainder') {
    return {
      version: 1,
      type: 'deposit_remainder',
      deposit: { mode: 'percent', percent: 30 },
      allowPayAhead: plan.allowPayAhead,
      lockPortalToDueNow: plan.lockPortalToDueNow,
    }
  }
  if (plan.planType === 'custom_installments') {
    return {
      version: 1,
      type: 'custom_installments',
      allowPayAhead: plan.allowPayAhead,
      lockPortalToDueNow: plan.lockPortalToDueNow,
      installments: plan.installments
        .filter((i) => i.status !== 'superseded')
        .map((i) => ({
          key: i.key,
          label: i.label,
          share:
            i.sequence === plan.installments.filter((x) => x.status !== 'superseded').length
              ? ({ mode: 'remainder' } as const)
              : ({ mode: 'fixed', amount: i.amountDue } as const),
          collectible: { when: 'on_or_after_visit_start' as const },
        })),
    }
  }
  return {
    ...DEFAULT_FULL_BALANCE_TEMPLATE,
    allowPayAhead: plan.allowPayAhead,
    lockPortalToDueNow: plan.lockPortalToDueNow,
  }
}

export function JobPaymentPlanEditor({
  open,
  onOpenChange,
  scheduleId,
  clientId,
  companyId,
  previewTotal,
  paymentPlan,
  isRecurring = false,
  hasPayments,
  onSaved,
}: Props) {
  const [template, setTemplate] = useState<JobPaymentPlanTemplate>(
    templateFromProgress(paymentPlan)
  )
  const [applyMode, setApplyMode] = useState<'this_visit' | 'all_future'>('this_visit')
  const [includeCustomized, setIncludeCustomized] = useState(false)
  const [confirmReallocate, setConfirmReallocate] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  useEffect(() => {
    if (open) {
      setTemplate(templateFromProgress(paymentPlan))
      setApplyMode('this_visit')
      setIncludeCustomized(false)
      setConfirmReallocate(false)
    }
  }, [open, paymentPlan])

  const handleSave = async () => {
    if (hasPayments && !confirmReallocate) {
      toast.error('Confirm that existing payments may be re-allocated before saving')
      return
    }
    setIsSaving(true)
    const result = await setJobPaymentPlanAction({
      scheduleId,
      clientId,
      companyId,
      template,
      applyMode: isRecurring ? applyMode : 'this_visit',
      includeCustomized: applyMode === 'all_future' ? includeCustomized : undefined,
      confirmReallocate: hasPayments ? true : undefined,
    })
    if (result.success) {
      if (result.allFuture) {
        toast.success(
          `This visit updated. ${formatAllFutureApplyToast(result.allFuture)}`
        )
      } else {
        toast.success(
          isRecurring
            ? 'Payment plan updated for this visit only'
            : 'Payment plan updated'
        )
      }
      onSaved({ allocatedExistingPayments: result.allocatedExistingPayments })
      onOpenChange(false)
    } else {
      toast.error(result.error || 'Could not save payment plan')
    }
    setIsSaving(false)
  }

  const handleReset = async () => {
    if (hasPayments && !confirmReallocate) {
      toast.error('Confirm reallocation to reset the plan when payments exist')
      return
    }
    setIsResetting(true)
    const result = await resetJobPaymentPlanAction({
      scheduleId,
      clientId,
      companyId,
      confirmReallocate: hasPayments ? true : undefined,
    })
    if (result.success) {
      toast.success('Payment plan reset to company/series default')
      onSaved({ allocatedExistingPayments: result.allocatedExistingPayments })
      onOpenChange(false)
    } else {
      toast.error(result.error || 'Could not reset payment plan')
    }
    setIsResetting(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={SCROLLABLE_MODAL_SHELL_LG} showCloseButton>
        <DialogHeader
          className={cn('border-b px-6 pt-5 pb-4', SCROLLABLE_MODAL_HEADER_CLASS)}
        >
          <DialogTitle>Job payment plan</DialogTitle>
          <DialogDescription>
            Set deposits or installments for this visit. Totals still come from line items.
          </DialogDescription>
        </DialogHeader>

        <div className={SCROLLABLE_MODAL_BODY_CLASS}>
          <div className="space-y-5 px-4 py-5 sm:px-6">
            <PaymentPlanTemplateFields
              value={template}
              onChange={setTemplate}
              previewTotal={Math.max(previewTotal, 1)}
              idPrefix="job-plan"
            />

            {isRecurring && (
              <div className="space-y-3 rounded-lg border p-3">
                <Label className="text-sm font-medium">Apply payment plan changes to</Label>
                <p className="text-xs text-muted-foreground">
                  Recurring series. Past visits and visits that already have payments are never
                  changed when you apply to future visits.
                </p>
                <RadioGroup
                  value={applyMode}
                  onValueChange={(value) => {
                    if (value === 'this_visit' || value === 'all_future') {
                      setApplyMode(value)
                    }
                  }}
                  className="grid gap-2"
                >
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40',
                      applyMode === 'this_visit' && 'border-primary bg-primary/5'
                    )}
                  >
                    <RadioGroupItem value="this_visit" className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="font-medium">This visit only</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Does not change the series default or other visits.
                      </span>
                    </span>
                  </label>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40',
                      applyMode === 'all_future' && 'border-primary bg-primary/5'
                    )}
                  >
                    <RadioGroupItem value="all_future" className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="font-medium">This and all future visits</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Saves a series default and updates open future visits that have no
                        payments.
                      </span>
                    </span>
                  </label>
                </RadioGroup>
                {applyMode === 'all_future' && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-dashed p-3 text-sm">
                    <Checkbox
                      checked={includeCustomized}
                      onCheckedChange={(v) => setIncludeCustomized(v === true)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      Include visits with customized plans
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Without this, visits previously set to “this visit only” are skipped.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}

            {hasPayments && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                <Checkbox
                  checked={confirmReallocate}
                  onCheckedChange={(v) => setConfirmReallocate(v === true)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  This job already has payments. Existing payments will be allocated in payment
                  order (oldest first). Re-link individual payments afterward if needed.
                </span>
              </label>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t px-4 py-4 sm:flex-row sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleReset()}
            disabled={isSaving || isResetting}
            className={cn('sm:mr-auto', MOBILE_FULL_WIDTH_BUTTON_CLASS)}
          >
            {isResetting ? <Loader2 className="size-4 animate-spin" /> : null}
            Reset to default
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className={MOBILE_FULL_WIDTH_BUTTON_CLASS}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || isResetting}
            className={MOBILE_FULL_WIDTH_BUTTON_CLASS}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
