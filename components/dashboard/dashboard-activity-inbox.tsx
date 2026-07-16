'use client'

import { useMemo, useState } from 'react'
import { Bell } from 'lucide-react'
import { StaffActivityCard } from '@/components/dashboard/staff-activity-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ActivityFeedItem } from '@/lib/activity-feed'
import {
  SCROLLABLE_MODAL_HEADER_CLASS,
  SCROLLABLE_MODAL_SHELL_MD,
} from '@/lib/mobile-layout'

type DashboardActivityInboxProps = {
  items: ActivityFeedItem[]
  timezone: string
}

export function DashboardActivityInbox({ items, timezone }: DashboardActivityInboxProps) {
  const [open, setOpen] = useState(false)

  const urgentCount = useMemo(
    () => items.filter((item) => item.urgent).length,
    [items]
  )

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 md:h-8 md:px-3.5"
        onClick={() => setOpen(true)}
      >
        <Bell className="size-4" />
        Activity
        {urgentCount > 0 ? (
          <Badge
            variant="default"
            className="h-5 min-w-5 rounded-full px-1.5 text-[10px] font-semibold"
          >
            {urgentCount > 99 ? '99+' : urgentCount}
          </Badge>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={SCROLLABLE_MODAL_SHELL_MD}>
          <DialogHeader
            className={`border-b px-6 py-4 text-left ${SCROLLABLE_MODAL_HEADER_CLASS}`}
          >
            <DialogTitle className="text-lg font-semibold">Needs attention</DialogTitle>
            <DialogDescription className="text-sm">
              Payments, contracts, estimates, leads, and client messages across your business.
            </DialogDescription>
          </DialogHeader>

          <StaffActivityCard
            items={items}
            timezone={timezone}
            variant="company"
            embedded
            showHeader={false}
            listClassName="min-h-0 flex-1"
            onItemNavigate={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}