'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'

import { getDashboardMapDataAction, getDashboardOverviewAction } from '@/app/action'
import { ActiveCrewsToday } from '@/components/dashboard/active-crews-today'
import { JobsTimeline } from '@/components/dashboard/jobs-timeline'
import { LiveCrewLocationsMap } from '@/components/dashboard/live-crew-locations-map'
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

  return (
    <div className="h-full p-4 flex flex-col gap-4">
      <Card className="flex-[3] p-4 flex flex-col min-h-0 shadow-sm bg-card">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 min-h-0 overflow-hidden">
          <div className="lg:col-span-2 lg:border-r lg:pr-6 flex flex-col min-h-0 border-border/70">
            <div className="flex items-center justify-between mb-3 pb-2 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold tracking-tight">
                {getActiveCrewsHeading(Boolean(data.isSoloBusiness))}
              </h2>
              {isRefreshing && (
                <span className="text-[10px] text-muted-foreground">Updating…</span>
              )}
            </div>
            <ActiveCrewsToday crews={data.crews} isSoloBusiness={data.isSoloBusiness} />
          </div>

          <div className="lg:col-span-3 lg:pl-6 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3 pb-2 border-b flex-shrink-0 gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">
                  {data.timelineMode === 'tomorrow'
                    ? "Tomorrow's Jobs Timeline"
                    : "Today's Jobs Timeline"}
                </h2>
                {data.timelineMode === 'tomorrow' && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Preview for {data.timelineDateLabel} — business closed for today
                  </p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
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
      </Card>

      <Card className="flex-[7] p-4 flex flex-col min-h-0 shadow-sm">
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <h2 className="text-lg font-semibold tracking-tight">Today&apos;s Job Sites</h2>
        </div>

        <LiveCrewLocationsMap
          data={mapData}
          isLoading={isMapLoading}
          error={mapError}
        />
      </Card>
    </div>
  )
}