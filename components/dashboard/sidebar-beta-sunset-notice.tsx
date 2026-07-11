'use client'

import Link from 'next/link'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { BetaSunsetWarning } from '@/lib/platform-release-schedule'
import { cn } from '@/lib/utils'

type SidebarBetaSunsetNoticeProps = {
  warning: BetaSunsetWarning | null
  expanded?: boolean
}

function shortLabel(warning: BetaSunsetWarning): string {
  if (warning.daysUntilRelease <= 0) return 'Launch today — subscribe'
  if (warning.daysUntilRelease === 1) return 'Launch tomorrow — subscribe'
  return `Launch in ${warning.daysUntilRelease}d — subscribe`
}

export function SidebarBetaSunsetNotice({
  warning,
  expanded = true,
}: SidebarBetaSunsetNoticeProps) {
  if (!warning) return null

  if (!expanded) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href="/dashboard/settings"
              className="mx-auto mb-1 block size-2 rounded-full bg-amber-500/75 ring-2 ring-background"
              aria-label={warning.message}
            />
          }
        />
        <TooltipContent side="right" className="max-w-[220px] text-xs">
          {warning.message}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Link
      href="/dashboard/settings"
      title={warning.message}
      className={cn(
        'mx-2 mb-2 block rounded-md px-2 py-1.5 text-[10px] leading-snug',
        'text-amber-700/85 hover:bg-amber-500/5 transition-colors dark:text-amber-500/75'
      )}
    >
      {shortLabel(warning)}
    </Link>
  )
}