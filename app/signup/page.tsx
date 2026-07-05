import { Suspense } from 'react'
import { SignupPageClient } from '@/components/marketing/signup-page-client'
import { getPlatformPlanPricing } from '@/lib/platform-pricing-server'

export default async function SignupPage() {
  const plans = await getPlatformPlanPricing()

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
          Loading signup…
        </div>
      }
    >
      <SignupPageClient plans={plans} />
    </Suspense>
  )
}