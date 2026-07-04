'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  filterActivityByPeriod,
  formatPortalActivityWhen,
  PORTAL_ACTIVITY_PERIOD_LABELS,
  type PortalActivityItem,
  type PortalActivityPeriod,
} from '@/lib/portal-activity'
import {
  CalendarDays,
  CreditCard,
  FileText,
  Receipt,
} from 'lucide-react'

const ICONS = {
  estimate_review: FileText,
  payment_due: CreditCard,
  payment_received: Receipt,
  visit_upcoming: CalendarDays,
} as const

export function PortalActivityCard({
  items,
  timezone,
}: {
  items: PortalActivityItem[]
  timezone: string
}) {
  const [period, setPeriod] = useState<PortalActivityPeriod>('30d')

  const filtered = useMemo(
    () => filterActivityByPeriod(items, period),
    [items, period]
  )

  return (
    <Card className="shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 shrink-0">
        <div>
          <h2 className="font-semibold text-lg">Activity</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Estimates, payments, and visits that need your attention
          </p>
        </div>
        <Select
          value={period}
          onValueChange={(value) => setPeriod((value ?? '30d') as PortalActivityPeriod)}
        >
          <SelectTrigger className="w-[140px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PORTAL_ACTIVITY_PERIOD_LABELS) as PortalActivityPeriod[]).map((key) => (
              <SelectItem key={key} value={key}>
                {PORTAL_ACTIVITY_PERIOD_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          Nothing in this period — try a longer range.
        </div>
      ) : (
        <ScrollArea className="max-h-72 scroll-fade" viewportClassName="scroll-fade">
          <ul className="divide-y">
            {filtered.map((item) => {
              const Icon = ICONS[item.type]
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 px-5 py-4 hover:bg-muted/40 transition-colors"
                  >
                    <div
                      className={`rounded-lg p-2 shrink-0 ${
                        item.urgent
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm">{item.title}</p>
                        {item.urgent && (
                          <Badge variant="secondary" className="text-[10px]">
                            Action needed
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">
                        {item.description}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 pt-0.5">
                      {formatPortalActivityWhen(item.occurredAt, timezone)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </ScrollArea>
      )}
    </Card>
  )
}