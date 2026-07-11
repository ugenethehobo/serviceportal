import { Suspense } from 'react'
import { SignupPageClient } from '@/components/marketing/signup-page-client'
import { getPlatformPlanPricing } from '@/lib/platform-pricing-server'
import { getPlatformReleaseMode } from '@/lib/platform-settings-server'

export default async function SignupPage() {
  const [plans, releaseMode] = await Promise.all([
    getPlatformPlanPricing(),
    getPlatformReleaseMode(),
  ])

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
          Loading signup…
        </div>
      }
    >
      <SignupPageClient plans={plans} releaseMode={releaseMode} />
    </Suspense>
  )
}