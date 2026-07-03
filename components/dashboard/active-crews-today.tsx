'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DashboardCrewSummary } from '@/lib/dashboard-overview'

interface ActiveCrewsTodayProps {
  crews: DashboardCrewSummary[]
}

function statusVariant(status: DashboardCrewSummary['status']) {
  if (status === 'on_job') return 'default' as const
  if (status === 'done') return 'outline' as const
  return 'secondary' as const
}

export function ActiveCrewsToday({ crews }: ActiveCrewsTodayProps) {
  if (crews.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg">
        <div className="text-center px-4">
          <p className="text-sm text-muted-foreground">No crews set up yet.</p>
          <Link href="/dashboard/crews" className="text-sm text-primary hover:underline mt-1 inline-block">
            Create your first crew
          </Link>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1 pr-1" viewportClassName="scroll-fade">
      <div className="space-y-3">
      {crews.map((crew) => (
        <div key={crew.id} className="rounded-lg border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-sm">{crew.name}</div>
              <div className="text-xs text-muted-foreground truncate">{crew.memberNames}</div>
            </div>
            <Badge variant={statusVariant(crew.status)} className="text-xs shrink-0">
              {crew.statusLabel}
            </Badge>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {crew.jobCount > 0
              ? `${crew.jobCount} ${crew.jobCount === 1 ? 'job' : 'jobs'} today`
              : 'No jobs today'}
            {crew.detail ? ` • ${crew.detail}` : ''}
          </div>
        </div>
      ))}
      </div>
    </ScrollArea>
  )
}