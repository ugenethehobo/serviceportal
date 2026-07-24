'use client'

import { useMemo, useState } from 'react'
import { Bell } from 'lucide-react'
import { PortalActivityCard } from '@/components/portal/portal-activity-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { PortalActivityItem } from '@/lib/portal-activity'
import {
  SCROLLABLE_MODAL_HEADER_CLASS,
  SCROLLABLE_MODAL_SHELL_MD,
} from '@/lib/mobile-layout'

type PortalActivityInboxProps = {
  items: PortalActivityItem[]
  timezone: string
}

export function PortalActivityInbox({ items, timezone }: PortalActivityInboxProps) {
  const [open, setOpen] = useState(false)

  const alertCount = useMemo(
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
        {alertCount > 0 ? (
          <Badge
            variant="default"
            className="h-5 min-w-5 rounded-full px-1.5 text-[10px] font-semibold"
          >
            {alertCount > 99 ? '99+' : alertCount}
          </Badge>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={SCROLLABLE_MODAL_SHELL_MD}>
          <DialogHeader
            className={`border-b px-6 py-4 text-left ${SCROLLABLE_MODAL_HEADER_CLASS}`}
          >
            <DialogTitle className="text-lg font-semibold">Your activity</DialogTitle>
            <DialogDescription className="text-sm">
              Estimates, contracts, payments, and visits that need your attention.
            </DialogDescription>
          </DialogHeader>

          <PortalActivityCard
            items={items}
            timezone={timezone}
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
