import { Suspense } from 'react'

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<OnboardingLoadingFallback />}>{children}</Suspense>
}

function OnboardingLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <p className="text-sm text-muted-foreground">Loading setup wizard…</p>
    </div>
  )
}