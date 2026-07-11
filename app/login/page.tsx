import { Suspense } from 'react'
import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { LoginForm } from '@/components/login-form'
import { Skeleton } from '@/components/ui/skeleton'
import { isBetaReleaseMode } from '@/lib/platform-settings'
import { getPlatformReleaseMode } from '@/lib/platform-settings-server'

export const dynamic = 'force-dynamic'

function LoginFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

export default async function LoginPage() {
  const releaseMode = await getPlatformReleaseMode()
  const isBeta = isBetaReleaseMode(releaseMode)

  return (
    <AuthSplitLayout>
      <Suspense fallback={<LoginFallback />}>
        <LoginForm isBeta={isBeta} />
      </Suspense>
    </AuthSplitLayout>
  )
}