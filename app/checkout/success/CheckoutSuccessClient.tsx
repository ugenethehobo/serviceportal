'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'

export default function CheckoutSuccessClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'redirecting'>('loading')

  const sessionId = searchParams.get('session_id')

  useEffect(() => {
    if (!sessionId) {
      // No session ID — something went wrong, send to pricing
      router.replace('/pricing?error=missing_session')
      return
    }

    // Give the user a moment to see the success state
    const timer = setTimeout(() => {
      setStatus('redirecting')
      // Redirect to the full onboarding wizard
      router.replace(`/onboarding?session_id=${sessionId}`)
    }, 1200)

    return () => clearTimeout(timer)
  }, [sessionId, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-12 w-12 text-green-600" />
        </div>

        <h1 className="text-3xl font-semibold tracking-tight mb-3">
          Payment Successful!
        </h1>

        <p className="text-lg text-muted-foreground mb-8">
          {status === 'loading' 
            ? "We're preparing your ServicePortal setup wizard..."
            : "Taking you to the setup wizard..."}
        </p>

        <div className="flex justify-center">
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-[loading_1.5s_ease_infinite] bg-primary" />
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          You will now complete a short setup wizard to configure your account.
        </p>
      </div>
    </div>
  )
}
