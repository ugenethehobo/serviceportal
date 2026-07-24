'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { usePortalCrewTerminology } from '@/components/portal/portal-shell-context'
import type { PortalJob } from '@/lib/portal-jobs'
import { Users } from 'lucide-react'

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

type PortalCrewCardProps = {
  job: PortalJob | null
}

export function PortalCrewCard({ job }: PortalCrewCardProps) {
  const terms = usePortalCrewTerminology()
  const crew = job?.crew ?? null
  const members = crew?.members ?? []

  return (
    <Card className="overflow-hidden shadow-sm">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your {terms.singularLower}
            </p>
            <h2 className="text-lg font-semibold tracking-tight">
              {crew?.name || `${terms.singular} being assigned`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {crew
                ? members.length > 0
                  ? 'Meet the people scheduled for this visit.'
                  : `This ${terms.singularLower} is assigned — member profiles will appear when available.`
                : `Your provider will confirm who is coming shortly.`}
            </p>
          </div>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Users className="size-5" />
          </div>
        </div>

        {members.length > 0 ? (
          <ul className="space-y-3">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-3 rounded-lg border bg-background/80 p-3"
              >
                <Avatar className="size-11">
                  <AvatarImage src={member.avatarUrl || undefined} alt={member.fullName} />
                  <AvatarFallback className="text-sm font-medium">
                    {initials(member.fullName) || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{member.fullName}</p>
                    {member.isLead ? (
                      <Badge variant="secondary" className="text-[11px]">
                        Lead
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {member.isLead
                      ? `${terms.singular} lead for this visit`
                      : 'Field team member'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              {crew
                ? `${terms.singular} profiles are not listed yet. You’ll still see them on the day of service.`
                : `No ${terms.singularLower} assigned yet for your next visit.`}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
