'use client'

import { useEffect, useState } from 'react'
import {
  getCompanyJobPaymentSettingsAction,
  updateCompanyJobPaymentSettingsAction,
} from '@/app/action'
import { PaymentPlanTemplateFields } from '@/components/dashboard/payment-plan-template-fields'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  DEFAULT_FULL_BALANCE_TEMPLATE,
  type JobPaymentPlanTemplate,
} from '@/lib/payment-plans'
import { MOBILE_FULL_WIDTH_BUTTON_CLASS } from '@/lib/mobile-layout'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function CompanyJobPaymentSettings() {
  const supabase = createClient()
  const [companyId, setCompanyId] = useState('')
  const [template, setTemplate] = useState<JobPaymentPlanTemplate>({
    ...DEFAULT_FULL_BALANCE_TEMPLATE,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setIsLoading(false)
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()
      if (!profile?.company_id) {
        setIsLoading(false)
        return
      }
      if (cancelled) return
      setCompanyId(profile.company_id)

      const result = await getCompanyJobPaymentSettingsAction(profile.company_id)
      if (cancelled) return
      if (result.success && result.settings?.defaultPlan) {
        setTemplate(result.settings.defaultPlan)
      } else if (!result.success) {
        toast.error(result.error || 'Failed to load payment plan defaults')
      }
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const handleSave = async () => {
    if (!companyId) return
    setIsSaving(true)
    const result = await updateCompanyJobPaymentSettingsAction(companyId, {
      defaultPlan: template,
    })
    if (result.success) {
      toast.success('Default payment plan saved')
      if (result.settings?.defaultPlan) setTemplate(result.settings.defaultPlan)
    } else {
      toast.error(result.error || 'Failed to save payment plan defaults')
    }
    setIsSaving(false)
  }

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        Loading payment plan defaults…
      </p>
    )
  }

  if (!companyId) {
    return (
      <p className="text-sm text-muted-foreground">
        Unable to load company for payment plan defaults.
      </p>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div>
        <h3 className="font-semibold text-base">Default job payment plan</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Applies to new jobs. Existing jobs keep their current plan unless you update them on the
          job billing tab.
        </p>
      </div>

      <PaymentPlanTemplateFields
        value={template}
        onChange={setTemplate}
        previewTotal={1000}
        idPrefix="company-default"
      />

      <div className="flex justify-end max-md:flex-col">
        <Button
          className={MOBILE_FULL_WIDTH_BUTTON_CLASS}
          onClick={() => void handleSave()}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : (
            'Save payment plan defaults'
          )}
        </Button>
      </div>
    </div>
  )
}
