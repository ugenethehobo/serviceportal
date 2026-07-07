'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'
import { validateOnboardingCompanyAction } from '@/app/onboarding-actions'
import { CompanyProfileSettings } from '@/components/dashboard/company-profile-settings'
import type { OnboardingStepHandle } from '@/components/dashboard/onboarding/onboarding-profile-step'
import { toast } from 'sonner'

type CompanyRow = {
  name?: string | null
  logo_url?: string | null
  timezone?: string | null
  business_hours_start?: string | null
  business_hours_end?: string | null
  address?: string | null
  address_street?: string | null
  address_unit?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  is_solo_business?: boolean | null
} | null

type OnboardingCompanyStepProps = {
  company: CompanyRow
}

export const OnboardingCompanyStep = forwardRef<OnboardingStepHandle, OnboardingCompanyStepProps>(
  function OnboardingCompanyStep({ company }, ref) {
    const saveStatusRef = useRef<'idle' | 'saving' | 'saved' | 'error'>('idle')

    useImperativeHandle(ref, () => ({
      validateAndSave: async () => {
        if (saveStatusRef.current === 'saving') {
          await new Promise((resolve) => setTimeout(resolve, 1200))
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }

        const result = await validateOnboardingCompanyAction()
        if (!result.success) {
          toast.error(result.error)
          return false
        }

        return true
      },
    }))

    return (
      <CompanyProfileSettings
        company={company}
        onSaveStatusChange={(status) => {
          saveStatusRef.current = status
        }}
      />
    )
  }
)