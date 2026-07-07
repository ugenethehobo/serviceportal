'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import {
  getServicePackagesAction,
  updateServicePackagesAction,
} from '@/app/service-package-actions'
import {
  draftsFromPackages,
  ServicePackagesEditor,
} from '@/components/dashboard/service-packages-editor'
import type { OnboardingStepHandle } from '@/components/dashboard/onboarding/onboarding-profile-step'
import {
  normalizeServicePackageDraft,
  type ServicePackageDraft,
} from '@/lib/service-packages'
import { toast } from 'sonner'

export const OnboardingPackagesStep = forwardRef<OnboardingStepHandle, object>(
  function OnboardingPackagesStep(_props, ref) {
    const [packages, setPackages] = useState<ServicePackageDraft[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
      const load = async () => {
        const result = await getServicePackagesAction()
        if (result.success) {
          setPackages(
            result.packages.length > 0
              ? draftsFromPackages(result.packages)
              : [
                  {
                    name: '',
                    description: '',
                    duration_minutes: 60,
                    price_estimate: '',
                    active: true,
                  },
                ]
          )
        }
        setIsLoading(false)
      }
      void load()
    }, [])

    useImperativeHandle(ref, () => ({
      validateAndSave: async () => {
        const normalized = packages
          .map((pkg, index) => normalizeServicePackageDraft(pkg, index))
          .filter((pkg): pkg is NonNullable<typeof pkg> => pkg != null)

        if (normalized.length === 0) {
          toast.error('Add at least one service package with a name')
          return false
        }

        const result = await updateServicePackagesAction(normalized)
        if (!result.success) {
          toast.error(result.error || 'Failed to save service packages')
          return false
        }

        return true
      },
    }))

    if (isLoading) {
      return <p className="text-sm text-muted-foreground">Loading service packages…</p>
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          These packages power online booking, request forms, and quick job templates. Add at least
          one to continue.
        </p>
        <ServicePackagesEditor packages={packages} onChange={setPackages} />
      </div>
    )
  }
)