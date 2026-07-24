'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { getDashboardMapDataAction, getDashboardOverviewAction } from '@/app/action'
import { ActiveCrewsToday } from '@/components/dashboard/active-crews-today'
import { DashboardActivityInbox } from '@/components/dashboard/dashboard-activity-inbox'
import { DashboardGlobalSearch } from '@/components/dashboard/dashboard-global-search'
import { DashboardMonthKpis } from '@/components/dashboard/dashboard-month-kpis'
import { JobsTimeline } from '@/components/dashboard/jobs-timeline'
import { Skeleton } from '@/components/ui/skeleton'
import { MainPageCard } from '@/components/ui/main-page-card'
import { PageHeader } from '@/components/ui/page-header'
import { getActiveCrewsHeading } from '@/lib/company-operations'
import type { DashboardOverviewData } from '@/lib/dashboard-overview'
import type { DashboardMapData } from '@/lib/dashboard-map'
import { MOBILE_MAP_MIN_HEIGHT_CLASS, MOBILE_PAGE_ROOT_CLASS } from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'

const LiveCrewLocationsMap = dynamic(
  () =>
    import('@/components/dashboard/live-crew-locations-map').then((m) => ({
      default: m.LiveCrewLocationsMap,
    })),
  {
    ssr: false,
    loading: () => (
      <Skeleton
        className={cn('w-full rounded-lg min-h-[240px]', MOBILE_MAP_MIN_HEIGHT_CLASS)}
      />
    ),
  }
)

interface DashboardPageClientProps {
  initialData: DashboardOverviewData
}

export function DashboardPageClient({ initialData }: DashboardPageClientProps) {
  const [data, setData] = useState(initialData)
  const [mapData, setMapData] = useState<DashboardMapData | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isMapLoading, setIsMapLoading] = useState(true)

  const isClosedDay = data.dashboardMode === 'closed_day'

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
    const scheduleMapLoad = () => void refreshMap()
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(scheduleMapLoad, { timeout: 2500 })
      return () => window.cancelIdleCallback(idleId)
    }
    const timeoutId = window.setTimeout(scheduleMapLoad, 0)
    return () => window.clearTimeout(timeoutId)
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

  const mapTitle =
    mapData?.mode === 'upcoming_open_days' ? 'Upcoming Job Sites' : "Today's Job Sites"

  return (
    <div className={MOBILE_PAGE_ROOT_CLASS}>
      <PageHeader
        title="Dashboard"
        description={
          isClosedDay
            ? `Closed today${data.closedDayLabel ? ` (${data.closedDayLabel})` : ''} — month-to-date performance and your next open days.`
            : 'Live crew activity, today\'s schedule, and job site locations.'
        }
        actions={
          <>
            <DashboardActivityInbox items={data.activity} timezone={data.timezone} />
            {isRefreshing ? (
              <span className="text-xs text-muted-foreground max-md:text-center">
                Updating…
              </span>
            ) : null}
          </>
        }
      />

      <DashboardGlobalSearch />

      <MainPageCard className="min-h-0 flex-[3] overflow-visible p-4 shadow-sm max-md:flex-none sm:p-5">
        {isClosedDay && data.monthlyKpis ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-5 lg:gap-0">
            <div className="flex min-h-0 flex-col overflow-hidden border-border/70 lg:col-span-2 lg:border-r lg:pr-6">
              <div className="mb-4 flex shrink-0 items-center justify-between border-b pb-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight">Revenue this month</h2>
                  <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                    {data.monthlyKpis.monthLabel}
                  </p>
                </div>
              </div>
              <DashboardMonthKpis kpis={data.monthlyKpis} variant="revenue" />
            </div>

            <div className="flex min-h-0 flex-col overflow-visible max-md:min-h-[200px] lg:col-span-3 lg:pl-6">
              <div className="mb-4 flex shrink-0 items-center justify-between gap-3 border-b pb-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight">Activity this month</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    Business closed today — live schedule returns on your next open day
                  </p>
                </div>
              </div>
              <DashboardMonthKpis kpis={data.monthlyKpis} variant="activity" />
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-5 lg:gap-0">
            <div className="flex min-h-0 flex-col overflow-hidden border-border/70 lg:col-span-2 lg:border-r lg:pr-6">
              <div className="mb-4 flex shrink-0 items-center justify-between border-b pb-3">
                <h2 className="text-lg font-semibold tracking-tight">
                  {getActiveCrewsHeading(
                    Boolean(data.isSoloBusiness),
                    data.crewLabel
                  )}
                </h2>
              </div>
              <ActiveCrewsToday
                crews={data.crews}
                isSoloBusiness={data.isSoloBusiness}
                crewLabel={data.crewLabel}
              />
            </div>

            <div className="flex min-h-0 flex-col overflow-visible max-md:min-h-[200px] lg:col-span-3 lg:pl-6">
              <div className="mb-4 flex shrink-0 items-center justify-between gap-3 border-b pb-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight">{timelineTitle}</h2>
                  {data.timelineMode === 'tomorrow' && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      Preview for {data.timelineDateLabel} — after today&apos;s business hours
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
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
        )}
      </MainPageCard>

      <MainPageCard className="min-h-0 flex-[7] p-4 shadow-sm max-md:flex-none max-md:overflow-visible sm:p-5">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{mapTitle}</h2>
            {mapData?.mode === 'upcoming_open_days' && mapData.previewRangeLabel && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {(mapData.previewJobCount ?? 0) > 0
                  ? `${mapData.previewJobCount} scheduled job${
                      mapData.previewJobCount === 1 ? '' : 's'
                    } · `
                  : 'No scheduled jobs · '}
                {mapData.previewRangeLabel}
              </p>
            )}
          </div>
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