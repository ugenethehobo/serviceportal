'use client'

import { useRouter } from 'next/navigation'
import { Clock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CompanySubscriptionAccess } from '@/lib/platform-trial'

type TrialStatusBannerProps = {
  access: CompanySubscriptionAccess
  isAdmin: boolean
}

export function TrialStatusBanner({ access, isAdmin }: TrialStatusBannerProps) {
  const router = useRouter()

  if (!access.isOnTrial && !access.isTrialExpired) return null

  if (access.isTrialExpired) {
    if (!isAdmin) return null

    return (
      <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p>
              <span className="font-medium">Your free trial has ended.</span>{' '}
              Subscribe to restore full access for your team and clients.
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              router.push('/dashboard/settings?section=subscription&trial=expired')
            }
          >
            Choose a plan
          </Button>
        </div>
      </div>
    )
  }

  const urgent = (access.daysRemaining ?? 0) <= 3

  return (
    <div
      className={
        urgent
          ? 'border-b border-amber-500/30 bg-amber-500/10 px-4 py-3'
          : 'border-b border-primary/20 bg-primary/5 px-4 py-3'
      }
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2 text-sm">
          <Clock
            className={`mt-0.5 size-4 shrink-0 ${urgent ? 'text-amber-600' : 'text-primary'}`}
          />
          <p>
            <span className="font-medium">{access.trialLabel}</span>
            {access.trialEndsAt && (
              <span className="text-muted-foreground">
                {' '}
                — ends{' '}
                {new Date(access.trialEndsAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            )}
          </p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant={urgent ? 'default' : 'outline'}
            onClick={() => router.push('/dashboard/settings?section=subscription')}
          >
            View plans
          </Button>
        )}
      </div>
    </div>
  )
}