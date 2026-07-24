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
  /** Denser rows and header for sidebars / billing columns. */
  compact?: boolean
  /** Override scroll region height; defaults to max-h-72 for standalone cards. */
  listClassName?: string
  showHeader?: boolean
  /** Called when a feed link is clicked (e.g. close a parent dialog before navigation). */
  onItemNavigate?: () => void
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
  compact = false,
  listClassName,
  showHeader = true,
  onItemNavigate,
}: ActivityFeedCardProps) {
  const [period, setPeriod] = useState<ActivityPeriod>(defaultPeriod)

  const filtered = useMemo(
    () => filterActivityByPeriod(items, period),
    [items, period]
  )

  const scrollClassName =
    listClassName ?? (compact ? 'max-h-full min-h-0 flex-1' : 'max-h-72')

  const header = showHeader ? (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-2 border-b sm:flex-row sm:items-start sm:justify-between',
        compact ? 'gap-2.5 px-3.5 py-3' : 'gap-3 px-5 py-4'
      )}
    >
      <div className="min-w-0">
        <h2 className={cn('font-semibold', compact ? 'text-sm' : 'text-lg')}>{title}</h2>
        {!compact && description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Select
        value={period}
        onValueChange={(value) => setPeriod((value ?? defaultPeriod) as ActivityPeriod)}
      >
        <SelectTrigger
          className={cn(
            'shrink-0 max-md:w-full max-md:min-w-0',
            compact ? 'h-8 w-full sm:w-[7.5rem]' : 'w-[140px]'
          )}
        >
          <SelectValue>
            {ACTIVITY_PERIOD_LABELS[period] || ACTIVITY_PERIOD_LABELS['30d']}
          </SelectValue>
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
    <div className="shrink-0 border-b px-3 py-2 sm:px-4">
      <Select
        value={period}
        onValueChange={(value) => setPeriod((value ?? defaultPeriod) as ActivityPeriod)}
      >
        <SelectTrigger className="w-full max-md:min-w-0">
          <SelectValue>
            {ACTIVITY_PERIOD_LABELS[period] || ACTIVITY_PERIOD_LABELS['30d']}
          </SelectValue>
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
              onClick={() => onItemNavigate?.()}
              className={cn(
                'flex w-full min-w-0 transition-colors hover:bg-muted/40',
                compact
                  ? 'items-start gap-2.5 px-3.5 py-2.5'
                  : embedded
                    ? 'flex-col gap-2 px-4 py-3.5 sm:px-5 sm:py-4'
                    : 'flex-col items-start gap-2 px-5 py-4 max-md:gap-3 sm:flex-row sm:items-start'
              )}
            >
              <div
                className={cn(
                  'flex min-w-0 gap-2.5',
                  compact || embedded ? 'w-full items-start' : 'flex-1 items-start',
                  !compact && !embedded && 'gap-3'
                )}
              >
                <div
                  className={cn(
                    'shrink-0 rounded-md',
                    compact ? 'p-1.5' : 'rounded-lg p-2',
                    item.urgent
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {Icon ? <Icon className={compact ? 'size-3.5' : 'size-4'} /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p
                      className={cn(
                        'font-medium break-words',
                        compact ? 'text-sm leading-snug' : 'text-sm'
                      )}
                    >
                      {item.title}
                    </p>
                    {item.urgent && (
                      <Badge variant="secondary" className="text-[11px]">
                        Action needed
                      </Badge>
                    )}
                  </div>
                  {!compact ? (
                    <p
                      className={cn(
                        'mt-1 text-sm leading-relaxed text-muted-foreground',
                        embedded ? 'break-words' : 'truncate'
                      )}
                    >
                      {item.description}
                    </p>
                  ) : null}
                  {compact || embedded ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatActivityWhen(item.occurredAt, timezone)}
                    </span>
                  ) : null}
                </div>
              </div>
              {!embedded && !compact ? (
                <span className="shrink-0 pt-0.5 text-xs text-muted-foreground max-md:self-end">
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
      <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
        {emptyMessage}
      </div>
    ) : (
      <ScrollArea
        className={cn('min-h-0 scroll-fade', scrollClassName)}
        viewportClassName="scroll-fade"
      >
        {list}
      </ScrollArea>
    )

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{body}</div>
      </div>
    )
  }

  return (
    <Card className="flex flex-col overflow-hidden shadow-sm">
      {header}
      {body}
    </Card>
  )
}