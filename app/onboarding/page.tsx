import { Suspense } from 'react'
import OnboardingWizard from './OnboardingWizard'

export default function OnboardingPage() {
  return (
    <Suspense 
      fallback={
        <div className="max-w-2xl mx-auto p-8 text-center">
          <div className="text-muted-foreground">Loading setup wizard...</div>
        </div>
      }
    >
      <OnboardingWizard />
    </Suspense>
  )
}
