'use client'

import { Fragment } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  getOnboardingProgressPercent,
  getOnboardingStepIndex,
  ONBOARDING_STEPS,
  type OnboardingStepId,
} from '@/components/dashboard/onboarding/onboarding-steps'

type OnboardingProgressHeaderProps = {
  currentStep: OnboardingStepId
}

export function OnboardingProgressHeader({ currentStep }: OnboardingProgressHeaderProps) {
  const currentIndex = getOnboardingStepIndex(currentStep)
  const progress = getOnboardingProgressPercent(currentStep)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Setup progress
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Step {currentIndex + 1} of {ONBOARDING_STEPS.length}
          </p>
        </div>
        <p className="text-sm font-medium tabular-nums">{progress}%</p>
      </div>

      <Progress value={progress} />

      <Breadcrumb className="hidden sm:block">
        <BreadcrumbList>
          {ONBOARDING_STEPS.map((step, index) => {
            const isCurrent = step.id === currentStep
            const isComplete = index < currentIndex

            return (
              <Fragment key={step.id}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  <BreadcrumbPage
                    className={cn(
                      'text-xs',
                      isCurrent && 'font-semibold text-foreground',
                      isComplete && 'text-muted-foreground',
                      !isCurrent && !isComplete && 'text-muted-foreground/70'
                    )}
                  >
                    {step.shortLabel}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}