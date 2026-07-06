'use client'

import { useCallback, useEffect, useState } from 'react'
import { getDashboardMapDataAction, getDashboardOverviewAction } from '@/app/action'
import { ActiveCrewsToday } from '@/components/dashboard/active-crews-today'
import { JobsTimeline } from '@/components/dashboard/jobs-timeline'
import { LiveCrewLocationsMap } from '@/components/dashboard/live-crew-locations-map'
import { MainPageCard } from '@/components/ui/main-page-card'
import { PageHeader } from '@/components/ui/page-header'
import { getActiveCrewsHeading } from '@/lib/company-operations'
import type { DashboardOverviewData } from '@/lib/dashboard-overview'
import type { DashboardMapData } from '@/lib/dashboard-map'

interface DashboardPageClientProps {
  initialData: DashboardOverviewData
}

export function DashboardPageClient({ initialData }: DashboardPageClientProps) {
  const [data, setData] = useState(initialData)
  const [mapData, setMapData] = useState<DashboardMapData | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isMapLoading, setIsMapLoading] = useState(true)

  const refreshMap = useCallback(async () => {
    const result = await getDashboardMapDataAction()
    if (result.success) {
      setMapData(result.data)
      setMapError(null)
    } else {
      setMapError(result.error || 'Failed to load map')
    }
    setIsMapLoading(false)
  }, [])

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    const [overviewResult] = await Promise.all([
      getDashboardOverviewAction(),
      refreshMap(),
    ])
    if (overviewResult.success) {
      setData(overviewResult.data)
    }
    setIsRefreshing(false)
  }, [refreshMap])

  useEffect(() => {
    refreshMap()
  }, [refreshMap])

  useEffect(() => {
    const interval = setInterval(refresh, 60_000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refresh])

  const timelineTitle =
    data.timelineMode === 'tomorrow' ? "Tomorrow's Jobs Timeline" : "Today's Jobs Timeline"

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6 max-md:gap-3 max-md:p-4">
      <PageHeader
        title="Dashboard"
        description="Live crew activity, today's schedule, and job site locations."
        actions={
          isRefreshing ? (
            <span className="text-xs text-muted-foreground">Updating…</span>
          ) : null
        }
      />

      <MainPageCard className="min-h-0 flex-[3] p-4 shadow-sm max-md:flex-none">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-5">
          <div className="flex min-h-0 flex-col border-border/70 lg:col-span-2 lg:border-r lg:pr-6">
            <div className="mb-3 flex shrink-0 items-center justify-between border-b pb-2">
              <h2 className="text-lg font-semibold tracking-tight">
                {getActiveCrewsHeading(Boolean(data.isSoloBusiness))}
              </h2>
            </div>
            <ActiveCrewsToday crews={data.crews} isSoloBusiness={data.isSoloBusiness} />
          </div>

          <div className="flex min-h-0 flex-col max-md:min-h-[200px] lg:col-span-3 lg:pl-6">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3 border-b pb-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">{timelineTitle}</h2>
                {data.timelineMode === 'tomorrow' && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Preview for {data.timelineDateLabel} — business closed for today
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {data.businessHours.start} – {data.businessHours.end}
              </span>
            </div>
            <JobsTimeline
              jobs={data.jobs}
              businessHours={data.businessHours}
              timezone={data.timezone}
              laneCount={data.laneCount}
              timelineMode={data.timelineMode}
            />
          </div>
        </div>
      </MainPageCard>

      <MainPageCard className="min-h-0 flex-[7] p-4 shadow-sm max-md:flex-none max-md:min-h-[45vh]">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Today&apos;s Job Sites</h2>
        </div>
        <LiveCrewLocationsMap
          data={mapData}
          isLoading={isMapLoading}
          error={mapError}
        />
      </MainPageCard>
    </div>
  )
}