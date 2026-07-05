'use client'

import { useEffect, useState } from 'react'
import { getTeamMemberDashboardAction } from '@/app/action'
import { TeamPageClient, TeamPageSkeleton } from '@/components/dashboard/team-page-client'
import { Card } from '@/components/ui/card'
import type { TeamMemberDashboardData } from '@/lib/team-dashboard'

export function SoloTeamView() {
  const [data, setData] = useState<TeamMemberDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const result = await getTeamMemberDashboardAction()
      if (result.success) {
        setData(result.data)
        setError(null)
      } else {
        setError(result.error || 'Unable to load your schedule.')
      }
    })()
  }, [])

  if (!data && !error) {
    return (
      <div className="h-full min-h-0 flex flex-col">
        <TeamPageSkeleton />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card className="max-w-md p-8 text-center">
          <p className="text-sm text-muted-foreground">{error || 'Unable to load your schedule.'}</p>
        </Card>
      </div>
    )
  }

  return <TeamPageClient initialData={data} variant="solo_owner" />
}