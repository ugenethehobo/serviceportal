'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  expandTemplate,
  normalizeTemplate,
  type CollectiblePolicy,
  type JobPaymentPlanTemplate,
  type JobPaymentPlanType,
} from '@/lib/payment-plans'
import { formatCurrency } from '@/lib/billing'
import { MOBILE_SELECT_TRIGGER_CLASS } from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'
import { Plus, Trash2 } from 'lucide-react'

const PLAN_TYPES: { value: JobPaymentPlanType; label: string; hint: string }[] = [
  {
    value: 'full_balance',
    label: 'Full balance',
    hint: 'Client pays the remaining job total when the visit is billable.',
  },
  {
    value: 'deposit_remainder',
    label: 'Deposit + remainder',
    hint: 'Collect a deposit anytime; remainder after the visit starts.',
  },
  {
    value: 'custom_installments',
    label: 'Custom installments',
    hint: 'Define labeled shares with their own collectibility rules.',
  },
]

const COLLECTIBLE_OPTIONS: { value: CollectiblePolicy['when']; label: string }[] = [
  { value: 'anytime', label: 'Anytime' },
  { value: 'on_or_after_visit_start', label: 'On or after visit start' },
  { value: 'on_or_after_job_complete', label: 'On or after job complete' },
  { value: 'relative_days', label: 'Days before visit start' },
]

const DEPOSIT_MODE_LABELS: Record<string, string> = {
  percent: 'Percent of job total',
  fixed: 'Fixed dollar amount',
}

const SHARE_MODE_LABELS: Record<string, string> = {
  percent: 'Percent',
  fixed: 'Fixed $',
  remainder: 'Remainder',
}

const COLLECTIBLE_LABELS = Object.fromEntries(
  COLLECTIBLE_OPTIONS.map((o) => [o.value, o.label])
) as Record<CollectiblePolicy['when'], string>

export type PaymentPlanTemplateFieldsProps = {
  value: JobPaymentPlanTemplate
  onChange: (next: JobPaymentPlanTemplate) => void
  /** Sample job total for live preview (default $1,000). */
  previewTotal?: number
  idPrefix?: string
}

export function PaymentPlanTemplateFields({
  value,
  onChange,
  previewTotal = 1000,
  idPrefix = 'plan',
}: PaymentPlanTemplateFieldsProps) {
  const template = normalizeTemplate(value)
  const preview = expandTemplate(template, previewTotal, new Date())
  const depositMode = template.deposit?.mode || 'percent'

  const setType = (type: JobPaymentPlanType) => {
    if (type === 'full_balance') {
      onChange(
        normalizeTemplate({
          ...template,
          type: 'full_balance',
          deposit: undefined,
          installments: undefined,
        })
      )
      return
    }
    if (type === 'deposit_remainder') {
      onChange(
        normalizeTemplate({
          ...template,
          type: 'deposit_remainder',
          deposit: template.deposit || { mode: 'percent', percent: 30 },
          installments: undefined,
        })
      )
      return
    }
    onChange(
      normalizeTemplate({
        ...template,
        type: 'custom_installments',
        installments: template.installments?.length
          ? template.installments
          : [
              {
                key: 'deposit',
                label: 'Deposit',
                share: { mode: 'percent', percent: 30 },
                collectible: { when: 'anytime' },
              },
              {
                key: 'final',
                label: 'Final payment',
                share: { mode: 'remainder' },
                collectible: { when: 'on_or_after_visit_start' },
              },
            ],
      })
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-sm font-medium" id={`${idPrefix}-type-label`}>
          Plan type
        </Label>
        <RadioGroup
          value={template.type}
          onValueChange={(next) => {
            if (next) setType(next as JobPaymentPlanType)
          }}
          aria-labelledby={`${idPrefix}-type-label`}
          className="grid gap-2"
        >
          {PLAN_TYPES.map((opt) => {
            const selected = template.type === opt.value
            return (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40',
                  selected && 'border-primary bg-primary/5'
                )}
              >
                <RadioGroupItem value={opt.value} className="mt-1" />
                <span className="min-w-0">
                  <span className="font-medium">{opt.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
                </span>
              </label>
            )
          })}
        </RadioGroup>
      </div>

      {template.type === 'deposit_remainder' && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <div className="min-w-0">
            <Label className="text-xs">Deposit type</Label>
            <Select
              value={depositMode}
              onValueChange={(mode) => {
                if (mode === 'fixed') {
                  onChange({
                    ...template,
                    deposit: { mode: 'fixed', amount: 300 },
                  })
                } else {
                  onChange({
                    ...template,
                    deposit: { mode: 'percent', percent: 30 },
                  })
                }
              }}
            >
              <SelectTrigger className={cn('mt-1 w-full', MOBILE_SELECT_TRIGGER_CLASS)}>
                <SelectValue>
                  {DEPOSIT_MODE_LABELS[depositMode] || DEPOSIT_MODE_LABELS.percent}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value="percent">Percent of job total</SelectItem>
                <SelectItem value="fixed">Fixed dollar amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="text-xs">
              {template.deposit?.mode === 'fixed' ? 'Deposit amount ($)' : 'Deposit percent'}
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              min={template.deposit?.mode === 'fixed' ? 0.01 : 1}
              max={template.deposit?.mode === 'fixed' ? undefined : 99}
              step={template.deposit?.mode === 'fixed' ? 0.01 : 1}
              className="mt-1"
              value={
                template.deposit?.mode === 'fixed'
                  ? template.deposit.amount
                  : template.deposit?.mode === 'percent'
                    ? template.deposit.percent
                    : 30
              }
              onChange={(e) => {
                const n = parseFloat(e.target.value)
                if (template.deposit?.mode === 'fixed') {
                  onChange({
                    ...template,
                    deposit: { mode: 'fixed', amount: isNaN(n) ? 0 : n },
                  })
                } else {
                  onChange({
                    ...template,
                    deposit: { mode: 'percent', percent: isNaN(n) ? 0 : n },
                  })
                }
              }}
            />
          </div>
        </div>
      )}

      {template.type === 'custom_installments' && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label className="text-sm font-medium">Installments</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="max-md:w-full"
              onClick={() => {
                const list = [...(template.installments || [])]
                const idx = list.length + 1
                list.push({
                  key: `part_${idx}`,
                  label: `Payment ${idx}`,
                  share:
                    list.length === 0
                      ? { mode: 'remainder' }
                      : { mode: 'percent', percent: 25 },
                  collectible: { when: 'on_or_after_visit_start' },
                })
                const hasRem = list.some((i) => i.share.mode === 'remainder')
                if (!hasRem && list.length > 0) {
                  list[list.length - 1] = {
                    ...list[list.length - 1],
                    share: { mode: 'remainder' },
                  }
                }
                onChange({ ...template, installments: list })
              }}
            >
              <Plus className="size-3.5" />
              Add installment
            </Button>
          </div>
          {(template.installments || []).map((inst, index) => (
            <div key={inst.key + index} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="min-w-0">
                    <Label className="text-xs">Label</Label>
                    <Input
                      className="mt-1"
                      value={inst.label}
                      onChange={(e) => {
                        const list = [...(template.installments || [])]
                        list[index] = { ...inst, label: e.target.value }
                        onChange({ ...template, installments: list })
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs">Share</Label>
                    <Select
                      value={inst.share.mode}
                      onValueChange={(mode) => {
                        const list = [...(template.installments || [])]
                        let share = inst.share
                        if (mode === 'percent') share = { mode: 'percent', percent: 25 }
                        else if (mode === 'fixed') share = { mode: 'fixed', amount: 100 }
                        else share = { mode: 'remainder' }
                        list[index] = { ...inst, share }
                        onChange({ ...template, installments: list })
                      }}
                    >
                      <SelectTrigger className={cn('mt-1 w-full', MOBILE_SELECT_TRIGGER_CLASS)}>
                        <SelectValue>
                          {SHARE_MODE_LABELS[inst.share.mode] || inst.share.mode}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectItem value="percent">Percent</SelectItem>
                        <SelectItem value="fixed">Fixed $</SelectItem>
                        <SelectItem value="remainder">Remainder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="mt-5 shrink-0 text-destructive"
                  disabled={(template.installments || []).length <= 1}
                  aria-label={`Remove ${inst.label || 'installment'}`}
                  onClick={() => {
                    const list = (template.installments || []).filter((_, i) => i !== index)
                    onChange({ ...template, installments: list })
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              {inst.share.mode === 'percent' && (
                <div>
                  <Label className="text-xs">Percent</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={99}
                    className="mt-1"
                    value={inst.share.percent}
                    onChange={(e) => {
                      const list = [...(template.installments || [])]
                      list[index] = {
                        ...inst,
                        share: { mode: 'percent', percent: parseFloat(e.target.value) || 0 },
                      }
                      onChange({ ...template, installments: list })
                    }}
                  />
                </div>
              )}
              {inst.share.mode === 'fixed' && (
                <div>
                  <Label className="text-xs">Amount ($)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step={0.01}
                    className="mt-1"
                    value={inst.share.amount}
                    onChange={(e) => {
                      const list = [...(template.installments || [])]
                      list[index] = {
                        ...inst,
                        share: { mode: 'fixed', amount: parseFloat(e.target.value) || 0 },
                      }
                      onChange({ ...template, installments: list })
                    }}
                  />
                </div>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="min-w-0">
                  <Label className="text-xs">Collectible</Label>
                  <Select
                    value={inst.collectible.when}
                    onValueChange={(when) => {
                      const list = [...(template.installments || [])]
                      let collectible: CollectiblePolicy
                      if (when === 'anytime') collectible = { when: 'anytime' }
                      else if (when === 'on_or_after_job_complete') {
                        collectible = { when: 'on_or_after_job_complete' }
                      } else if (when === 'relative_days') {
                        collectible = { when: 'relative_days', daysBeforeStart: 7 }
                      } else {
                        collectible = { when: 'on_or_after_visit_start' }
                      }
                      list[index] = { ...inst, collectible }
                      onChange({ ...template, installments: list })
                    }}
                  >
                    <SelectTrigger className={cn('mt-1 w-full', MOBILE_SELECT_TRIGGER_CLASS)}>
                      <SelectValue>
                        {COLLECTIBLE_LABELS[inst.collectible.when] ||
                          COLLECTIBLE_LABELS.anytime}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      {COLLECTIBLE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {inst.collectible.when === 'relative_days' && (
                  <div className="min-w-0">
                    <Label className="text-xs">Days before start</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="mt-1"
                      value={inst.collectible.daysBeforeStart}
                      onChange={(e) => {
                        const list = [...(template.installments || [])]
                        list[index] = {
                          ...inst,
                          collectible: {
                            when: 'relative_days',
                            daysBeforeStart: parseInt(e.target.value, 10) || 0,
                          },
                        }
                        onChange({ ...template, installments: list })
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Allow pay ahead</p>
            <p className="text-xs text-muted-foreground">
              Clients can pay more than the amount due now, up to the job balance.
            </p>
          </div>
          <Switch
            checked={template.allowPayAhead !== false}
            onCheckedChange={(checked) =>
              onChange({ ...template, allowPayAhead: checked })
            }
            aria-label="Allow pay ahead"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Lock portal to due now</p>
            <p className="text-xs text-muted-foreground">
              Hide “Pay other amount” in the client portal (server still enforces pay-ahead rules).
            </p>
          </div>
          <Switch
            checked={Boolean(template.lockPortalToDueNow)}
            onCheckedChange={(checked) =>
              onChange({ ...template, lockPortalToDueNow: checked })
            }
            aria-label="Lock portal to due now"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Preview on a {formatCurrency(previewTotal)} job
        </p>
        <ul className="mt-2 space-y-1">
          {preview.map((row) => (
            <li key={row.key} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{row.label}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {formatCurrency(row.amount_due)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
