import { Suspense } from 'react'
import { SignupPageClient } from '@/components/marketing/signup-page-client'

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
          Loading signup…
        </div>
      }
    >
      <SignupPageClient />
    </Suspense>
  )
}