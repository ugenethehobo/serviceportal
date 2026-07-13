'use client'

import { ActivityFeedCard } from '@/components/shared/activity-feed-card'
import type { ActivityFeedItem } from '@/lib/activity-feed'
import {
  CalendarDays,
  CreditCard,
  FileSignature,
  FileText,
  MessageSquare,
  Receipt,
  UserPlus,
} from 'lucide-react'

const STAFF_ACTIVITY_ICONS = {
  payment_received: Receipt,
  contract_signed: FileSignature,
  contract_awaiting_signature: FileSignature,
  contract_signing: FileSignature,
  estimate_accepted: FileText,
  estimate_declined: FileText,
  estimate_sent: FileText,
  estimate_review: FileText,
  lead_follow_up_due: UserPlus,
  client_message: MessageSquare,
  payment_due: CreditCard,
  visit_upcoming: CalendarDays,
} as const

type StaffActivityCardProps = {
  items: ActivityFeedItem[]
  timezone: string
  variant?: 'company' | 'client'
  embedded?: boolean
  showHeader?: boolean
  listClassName?: string
}

export function StaffActivityCard({
  items,
  timezone,
  variant = 'company',
  embedded = false,
  showHeader = true,
  listClassName,
}: StaffActivityCardProps) {
  return (
    <ActivityFeedCard
      items={items}
      timezone={timezone}
      title={variant === 'company' ? 'Needs attention' : 'Activity'}
      description={
        variant === 'company'
          ? 'Payments, contracts, estimates, leads, and client messages across your business'
          : 'Estimates, contracts, payments, and visits for this client'
      }
      icons={STAFF_ACTIVITY_ICONS}
      emptyMessage={
        variant === 'company'
          ? 'No recent activity — you are all caught up.'
          : 'Nothing in this period — try a longer range.'
      }
      embedded={embedded}
      showHeader={showHeader}
      listClassName={listClassName}
    />
  )
}