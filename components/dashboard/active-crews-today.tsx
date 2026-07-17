'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getCrewTerminology } from '@/lib/crew-terminology'
import type { DashboardCrewSummary } from '@/lib/dashboard-overview'

interface ActiveCrewsTodayProps {
  crews: DashboardCrewSummary[]
  isSoloBusiness?: boolean
  crewLabel?: string | null
}

function statusVariant(status: DashboardCrewSummary['status']) {
  if (status === 'on_job') return 'default' as const
  if (status === 'done') return 'outline' as const
  return 'secondary' as const
}

export function ActiveCrewsToday({
  crews,
  isSoloBusiness = false,
  crewLabel,
}: ActiveCrewsTodayProps) {
  const terms = getCrewTerminology(crewLabel)

  if (crews.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg">
        <div className="text-center px-4">
          <p className="text-sm text-muted-foreground">
            {isSoloBusiness
              ? 'No jobs scheduled for today yet.'
              : `No ${terms.pluralLower} set up yet.`}
          </p>
          {!isSoloBusiness && (
            <Link href="/dashboard/crews" className="text-sm text-primary hover:underline mt-1 inline-block">
              Create your first {terms.singularLower}
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1 pr-3 overflow-auto scroll-fade" viewportClassName="scroll-fade">
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
