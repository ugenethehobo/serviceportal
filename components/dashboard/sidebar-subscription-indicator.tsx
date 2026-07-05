'use client'

import { Badge } from '@/components/ui/badge'
import {
  getSubscriptionDisplayLabel,
  type PlatformPlanId,
  type PlatformSubscriptionStatus,
} from '@/lib/platform-billing'
import type { CompanySubscriptionAccess } from '@/lib/platform-trial'
import { cn } from '@/lib/utils'

function getSubscriptionBadgeVariant(
  plan: PlatformPlanId,
  status: PlatformSubscriptionStatus
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'trial_expired' || status === 'canceled' || status === 'past_due' || status === 'unpaid') {
    return 'destructive'
  }
  if (plan === 'pro') return 'default'
  if (plan === 'basic') return 'secondary'
  return 'outline'
}

function getSubscriptionDotClass(
  plan: PlatformPlanId,
  status: PlatformSubscriptionStatus,
  daysRemaining: number | null
): string {
  if (status === 'trial_expired' || status === 'canceled' || status === 'past_due' || status === 'unpaid') {
    return 'bg-destructive'
  }
  if (plan === 'pro') return 'bg-primary'
  if (plan === 'basic') return 'bg-blue-500'
  if (daysRemaining != null && daysRemaining <= 3) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function formatSubscriptionLabel(access: CompanySubscriptionAccess): string {
  const base = getSubscriptionDisplayLabel(access.plan, access.status)
  if (access.isOnTrial && access.daysRemaining != null && access.daysRemaining > 0) {
    return access.daysRemaining === 1
      ? `${base} · 1 day left`
      : `${base} · ${access.daysRemaining}d left`
  }
  return base
}

type SidebarSubscriptionIndicatorProps = {
  access: CompanySubscriptionAccess | null
  expanded?: boolean
}

export function SidebarSubscriptionDot({
  access,
  className,
}: {
  access: CompanySubscriptionAccess | null
  className?: string
}) {
  if (!access) return null

  const label = formatSubscriptionLabel(access)

  return (
    <span
      className={cn(
        'absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-background',
        getSubscriptionDotClass(access.plan, access.status, access.daysRemaining),
        className
      )}
      title={label}
      aria-label={label}
    />
  )
}

export function SidebarSubscriptionIndicator({
  access,
  expanded = true,
}: SidebarSubscriptionIndicatorProps) {
  if (!access) return null

  const label = formatSubscriptionLabel(access)
  const variant = getSubscriptionBadgeVariant(access.plan, access.status)

  if (!expanded) {
    return <SidebarSubscriptionDot access={access} />
  }

  return (
    <div className="mt-0.5 flex h-5 items-center">
      <Badge variant={variant} className="h-5 max-w-full truncate px-1.5 text-[10px] leading-none">
        {label}
      </Badge>
    </div>
  )
}