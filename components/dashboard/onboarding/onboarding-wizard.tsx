'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { OnboardingBookingStep } from '@/components/dashboard/onboarding/onboarding-booking-step'
import { OnboardingCompanyStep } from '@/components/dashboard/onboarding/onboarding-company-step'
import { OnboardingFinishingScreen } from '@/components/dashboard/onboarding/onboarding-finishing-screen'
import { OnboardingPackagesStep } from '@/components/dashboard/onboarding/onboarding-packages-step'
import { OnboardingPaymentsStep } from '@/components/dashboard/onboarding/onboarding-payments-step'
import { OnboardingProfileStep } from '@/components/dashboard/onboarding/onboarding-profile-step'
import type { OnboardingStepHandle } from '@/components/dashboard/onboarding/onboarding-profile-step'
import { OnboardingProgressHeader } from '@/components/dashboard/onboarding/onboarding-progress-header'
import {
  getOnboardingStepIndex,
  ONBOARDING_STEPS,
  type OnboardingStepId,
} from '@/components/dashboard/onboarding/onboarding-steps'
import { usePersonalization } from '@/components/personalization-provider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { suggestBookingSlug } from '@/lib/booking'
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

type OnboardingWizardProps = {
  initialData: {
    account: {
      fullName: string
      email: string
      avatarUrl: string | null
      accentColor?: string | null
      backgroundImageUrl?: string | null
    }
    company: {
      name: string | null
      logo_url: string | null
      timezone: string | null
      business_hours_start: string | null
      business_hours_end: string | null
      address: string | null
      address_street: string | null
      address_unit: string | null
      address_city: string | null
      address_state: string | null
      address_zip: string | null
      is_solo_business: boolean | null
      booking_slug: string | null
    }
  }
}

function isOnboardingStepId(value: string | null): value is OnboardingStepId {
  return ONBOARDING_STEPS.some((step) => step.id === value)
}

export function OnboardingWizard({ initialData }: OnboardingWizardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const stepParam = searchParams.get('step')
  const stripeParam = searchParams.get('stripe')

  const [currentStep, setCurrentStep] = useState<OnboardingStepId>(() =>
    isOnboardingStepId(stepParam) ? stepParam : 'profile'
  )
  const [fullName, setFullName] = useState(initialData.account.fullName)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)

  const stepRef = useRef<OnboardingStepHandle>(null)

  const currentStepMeta = useMemo(
    () => ONBOARDING_STEPS.find((step) => step.id === currentStep)!,
    [currentStep]
  )
  const currentStepIndex = getOnboardingStepIndex(currentStep)
  const isLastStep = currentStepIndex === ONBOARDING_STEPS.length - 1
  const suggestedSlug = useMemo(
    () =>
      initialData.company.booking_slug ||
      suggestBookingSlug(initialData.company.name || 'company'),
    [initialData.company.booking_slug, initialData.company.name]
  )

  const goToStep = useCallback(
    (stepId: OnboardingStepId) => {
      setCurrentStep(stepId)
      const url = new URL(window.location.href)
      url.searchParams.set('step', stepId)
      url.searchParams.delete('stripe')
      router.replace(`${url.pathname}?${url.searchParams.toString()}`)
    },
    [router]
  )

  useEffect(() => {
    if (stripeParam === 'return' || stripeParam === 'refresh') {
      setCurrentStep('payments')
      const handleStripeReturn = async () => {
        if (stripeParam === 'refresh') {
          await fetch('/api/stripe/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnTo: 'onboarding' }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.url) window.location.href = data.url
            })
          return
        }

        await fetch('/api/stripe/connect/refresh', { method: 'POST' })
        toast.success('Stripe status updated')
        router.replace('/onboarding?step=payments')
      }
      void handleStripeReturn()
    }
  }, [stripeParam, router])

  const handleBack = () => {
    if (currentStepIndex <= 0) return
    goToStep(ONBOARDING_STEPS[currentStepIndex - 1].id)
  }

  const handleSkip = () => {
    if (!currentStepMeta.skippable || isLastStep) return
    goToStep(ONBOARDING_STEPS[currentStepIndex + 1].id)
  }

  const handleContinue = async () => {
    setIsAdvancing(true)

    const saved = (await stepRef.current?.validateAndSave()) ?? true
    if (!saved) {
      setIsAdvancing(false)
      return
    }

    if (isLastStep) {
      setIsFinishing(true)
      setIsAdvancing(false)
      return
    }

    goToStep(ONBOARDING_STEPS[currentStepIndex + 1].id)
    setIsAdvancing(false)
  }

  const handleFinishComplete = () => {
    window.location.href = '/dashboard'
  }

  const handleFinishError = (message: string) => {
    setIsFinishing(false)
    toast.error(message)
  }

  const StepIcon = currentStepMeta.icon
  const { backgroundImageUrl } = usePersonalization()
  const hasAppBackground = Boolean(backgroundImageUrl)

  return (
    <>
      <div
        data-app-shell
        className={cn(
          'min-h-screen',
          hasAppBackground ? 'bg-transparent' : 'bg-muted/30'
        )}
      >
        <header
          className={cn(
            'sticky top-0 z-10',
            hasAppBackground ? 'bg-transparent' : 'border-b bg-background/80 backdrop-blur-sm'
          )}
        >
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <span className="font-semibold tracking-tight">Welcome to ServicePortal</span>
            </div>
            <p className="text-sm text-muted-foreground hidden sm:inline">
              {initialData.company.name || 'Your company'}
            </p>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-8">
          <div className="space-y-6">
            <OnboardingProgressHeader currentStep={currentStep} />

            <Card>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-muted p-2 shrink-0">
                    <StepIcon className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle>{currentStepMeta.label}</CardTitle>
                    <CardDescription className="mt-1">
                      {currentStepMeta.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {currentStep === 'profile' ? (
                  <OnboardingProfileStep
                    ref={stepRef}
                    fullName={fullName}
                    email={initialData.account.email}
                    avatarUrl={initialData.account.avatarUrl}
                    accentColor={initialData.account.accentColor}
                    backgroundImageUrl={initialData.account.backgroundImageUrl}
                    onFullNameChange={setFullName}
                  />
                ) : null}

                {currentStep === 'company' ? (
                  <OnboardingCompanyStep ref={stepRef} company={initialData.company} />
                ) : null}

                {currentStep === 'payments' ? <OnboardingPaymentsStep ref={stepRef} /> : null}

                {currentStep === 'packages' ? <OnboardingPackagesStep ref={stepRef} /> : null}

                {currentStep === 'booking' ? (
                  <OnboardingBookingStep ref={stepRef} suggestedSlug={suggestedSlug} />
                ) : null}
              </CardContent>

              <CardFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between border-t bg-muted/20 px-6 py-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBack}
                  disabled={currentStepIndex === 0 || isAdvancing}
                  className="w-full sm:w-auto"
                >
                  <ArrowLeft className="size-4 mr-2" />
                  Back
                </Button>

                <div className="flex w-full sm:w-auto gap-2">
                  {currentStepMeta.skippable ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSkip}
                      disabled={isAdvancing}
                      className="flex-1 sm:flex-none"
                    >
                      Skip for now
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => void handleContinue()}
                    disabled={isAdvancing}
                    className="flex-1 sm:flex-none"
                  >
                    {isAdvancing ? (
                      'Saving…'
                    ) : isLastStep ? (
                      'Finish setup'
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="size-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </div>
        </main>
      </div>

      {isFinishing ? (
        <OnboardingFinishingScreen
          companyName={initialData.company.name || ''}
          onComplete={handleFinishComplete}
          onError={handleFinishError}
        />
      ) : null}
    </>
  )
}