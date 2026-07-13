'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
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
  ACTIVITY_PERIOD_LABELS,
  filterActivityByPeriod,
  formatActivityWhen,
  type ActivityFeedItem,
  type ActivityPeriod,
} from '@/lib/activity-feed'
import { SCROLLABLE_MODAL_BODY_CLASS } from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'

type ActivityFeedCardProps = {
  items: ActivityFeedItem[]
  timezone: string
  title?: string
  description?: string
  icons: Record<string, LucideIcon>
  defaultPeriod?: ActivityPeriod
  emptyMessage?: string
  /** When true, omits the outer Card — for sheets and embedded panels. */
  embedded?: boolean
  /** Override scroll region height; defaults to max-h-72 for standalone cards. */
  listClassName?: string
  showHeader?: boolean
}

export function ActivityFeedCard({
  items,
  timezone,
  title = 'Activity',
  description = 'Recent updates that may need your attention',
  icons,
  defaultPeriod = '30d',
  emptyMessage = 'Nothing in this period — try a longer range.',
  embedded = false,
  listClassName,
  showHeader = true,
}: ActivityFeedCardProps) {
  const [period, setPeriod] = useState<ActivityPeriod>(defaultPeriod)

  const filtered = useMemo(
    () => filterActivityByPeriod(items, period),
    [items, period]
  )

  const scrollClassName = listClassName ?? 'max-h-72'

  const header = showHeader ? (
    <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 shrink-0">
      <div>
        <h2 className="font-semibold text-lg">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Select
        value={period}
        onValueChange={(value) => setPeriod((value ?? defaultPeriod) as ActivityPeriod)}
      >
        <SelectTrigger className="w-[140px] shrink-0 max-md:w-full max-md:min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ACTIVITY_PERIOD_LABELS) as ActivityPeriod[]).map((key) => (
            <SelectItem key={key} value={key}>
              {ACTIVITY_PERIOD_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : (
    <div className="shrink-0 border-b px-4 py-3 max-md:px-4 sm:px-5">
      <Select
        value={period}
        onValueChange={(value) => setPeriod((value ?? defaultPeriod) as ActivityPeriod)}
      >
        <SelectTrigger className="w-full max-md:min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(ACTIVITY_PERIOD_LABELS) as ActivityPeriod[]).map((key) => (
            <SelectItem key={key} value={key}>
              {ACTIVITY_PERIOD_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const list = (
    <ul className="divide-y">
      {filtered.map((item) => {
        const Icon = icons[item.type]
        return (
          <li key={item.id} className="min-w-0">
            <Link
              href={item.href}
              className={cn(
                'flex w-full min-w-0 transition-colors hover:bg-muted/40',
                embedded
                  ? 'flex-col gap-2 px-4 py-3 sm:px-5 sm:py-3.5'
                  : 'flex-col items-start gap-2 px-5 py-4 max-md:gap-3 sm:flex-row sm:items-start'
              )}
            >
              <div
                className={cn(
                  'flex min-w-0 gap-3',
                  embedded ? 'w-full items-start' : 'flex-1 items-start'
                )}
              >
                <div
                  className={`shrink-0 rounded-lg p-2 ${
                    item.urgent
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {Icon ? <Icon className="size-4" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium break-words">{item.title}</p>
                    {item.urgent && (
                      <Badge variant="secondary" className="text-[10px]">
                        Action needed
                      </Badge>
                    )}
                  </div>
                  <p
                    className={cn(
                      'mt-0.5 text-sm text-muted-foreground',
                      embedded ? 'break-words' : 'truncate'
                    )}
                  >
                    {item.description}
                  </p>
                  {embedded ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatActivityWhen(item.occurredAt, timezone)}
                    </span>
                  ) : null}
                </div>
              </div>
              {!embedded ? (
                <span className="shrink-0 pt-0.5 text-xs text-muted-foreground max-md:self-end sm:pt-0.5">
                  {formatActivityWhen(item.occurredAt, timezone)}
                </span>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )

  const body =
    filtered.length === 0 ? (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-5">
        {emptyMessage}
      </div>
    ) : embedded ? (
      <div className={cn(SCROLLABLE_MODAL_BODY_CLASS, scrollClassName)}>{list}</div>
    ) : (
      <ScrollArea
        className={`scroll-fade ${scrollClassName}`}
        viewportClassName="scroll-fade"
      >
        {list}
      </ScrollArea>
    )

  if (embedded) {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{body}</div>
      </div>
    )
  }

  return (
    <Card className="shadow-sm overflow-hidden flex flex-col">
      {header}
      {body}
    </Card>
  )
}