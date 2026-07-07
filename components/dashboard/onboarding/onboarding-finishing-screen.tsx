'use client'

import { useEffect, useState } from 'react'
import { finalizeOnboardingAction } from '@/app/onboarding-actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, Loader2 } from 'lucide-react'

const FINISHING_MESSAGES = [
  { label: 'Saving your profile…', durationMs: 700 },
  { label: 'Applying company settings…', durationMs: 900 },
  { label: 'Configuring payments…', durationMs: 700 },
  { label: 'Setting up service packages…', durationMs: 900 },
  { label: 'Enabling client booking…', durationMs: 800 },
  { label: 'Preparing your dashboard…', durationMs: 1000 },
] as const

type OnboardingFinishingScreenProps = {
  companyName: string
  onComplete: () => void
  onError: (message: string) => void
}

export function OnboardingFinishingScreen({
  companyName,
  onComplete,
  onError,
}: OnboardingFinishingScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [progress, setProgress] = useState(8)

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      for (let index = 0; index < FINISHING_MESSAGES.length; index++) {
        if (cancelled) return
        const step = FINISHING_MESSAGES[index]
        setMessageIndex(index)
        setProgress(Math.round(((index + 1) / (FINISHING_MESSAGES.length + 1)) * 100))
        await new Promise((resolve) => {
          timeoutId = setTimeout(resolve, step.durationMs)
        })
      }

      if (cancelled) return

      setProgress(96)
      const result = await finalizeOnboardingAction()

      if (cancelled) return

      if (!result.success) {
        onError(result.error)
        return
      }

      setMessageIndex(FINISHING_MESSAGES.length)
      setProgress(100)
      await new Promise((resolve) => {
        timeoutId = setTimeout(resolve, 600)
      })

      if (!cancelled) {
        onComplete()
      }
    }

    void run()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [onComplete, onError])

  const currentMessage =
    messageIndex >= FINISHING_MESSAGES.length
      ? 'All set — welcome aboard!'
      : FINISHING_MESSAGES[messageIndex].label

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
            {progress >= 100 ? (
              <CheckCircle2 className="size-7 text-primary" />
            ) : (
              <Loader2 className="size-7 text-primary animate-spin" />
            )}
          </div>
          <CardTitle className="text-xl">Setting up {companyName || 'your workspace'}</CardTitle>
          <CardDescription>
            We&apos;re applying your settings and getting everything ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} />
          <p className="text-sm text-center text-muted-foreground">{currentMessage}</p>
        </CardContent>
      </Card>
    </div>
  )
}