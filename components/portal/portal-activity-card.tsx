'use client'

import { ActivityFeedCard } from '@/components/shared/activity-feed-card'
import type { PortalActivityItem } from '@/lib/portal-activity'
import {
  CalendarDays,
  CreditCard,
  FileSignature,
  FileText,
  Receipt,
} from 'lucide-react'

const ICONS = {
  estimate_review: FileText,
  contract_signing: FileSignature,
  contract_signed: FileSignature,
  payment_due: CreditCard,
  payment_received: Receipt,
  visit_upcoming: CalendarDays,
} as const

type PortalActivityCardProps = {
  items: PortalActivityItem[]
  timezone: string
  embedded?: boolean
  showHeader?: boolean
  listClassName?: string
  onItemNavigate?: () => void
}

export function PortalActivityCard({
  items,
  timezone,
  embedded,
  showHeader,
  listClassName,
  onItemNavigate,
}: PortalActivityCardProps) {
  return (
    <ActivityFeedCard
      items={items}
      timezone={timezone}
      title="Activity"
      description="Estimates, contracts, payments, and visits that need your attention"
      icons={ICONS}
      embedded={embedded}
      showHeader={showHeader}
      listClassName={listClassName}
      onItemNavigate={onItemNavigate}
    />
  )
}
