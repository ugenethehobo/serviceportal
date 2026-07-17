'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { getTeamMemberDashboardAction } from '@/app/action'
import {
  completeFieldJobAction,
  startFieldJobAction,
} from '@/app/field-job-actions'
import { optimizeCrewDayRouteAction } from '@/app/route-optimize-actions'
import { JobStatusBadge } from '@/components/dashboard/job-status-badge'
import { MapsNavigateButton } from '@/components/dashboard/maps-navigate-button'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MainPageCard, MainPageCardScroll } from '@/components/ui/main-page-card'
import {
  Map as RouteMap,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerLabel,
  MarkerTooltip,
  useMap,
} from '@/components/ui/map'

import { Skeleton } from '@/components/ui/skeleton'
import {
  getAvailableFieldJobAction,
  getFieldJobActionLabel,
} from '@/lib/field-job-access'
import {
  formatRouteDistance,
  formatRouteDuration,
} from '@/lib/road-routing'
import {
  CREW_ROUTE_COLORS,
  type CrewRoute,
  type RouteStop,
} from '@/lib/route-planner'
import type { TeamMemberDashboardData } from '@/lib/team-dashboard'
import {
  MOBILE_FULL_WIDTH_BUTTON_CLASS,
  MOBILE_MAP_MIN_HEIGHT_CLASS,
} from '@/lib/mobile-layout'
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  List,
  Loader2,
  MapPin,
  Map as MapIcon,
  Play,
  Route,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type ViewMode = 'list' | 'map'
type TeamPageVariant = 'team_member' | 'solo_owner'

interface TeamPageClientProps {
  initialData: TeamMemberDashboardData
  variant?: TeamPageVariant
  /** When true, omit page-level title chrome (parent owns header/tabs). */
  embedded?: boolean
}

function MapBounds({ coordinates }: { coordinates: [number, number][] }) {
  const { map, isLoaded } = useMap()

  useEffect(() => {
    if (!isLoaded || !map || coordinates.length === 0) return

    if (coordinates.length === 1) {
      map.flyTo({ center: coordinates[0], zoom: 13, duration: 0 })
      return
    }

    let minLng = coordinates[0][0]
    let maxLng = coordinates[0][0]
    let minLat = coordinates[0][1]
    let maxLat = coordinates[0][1]

    for (const [lng, lat] of coordinates) {
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    }

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 60, maxZoom: 14, duration: 0 }
    )
  }, [map, isLoaded, coordinates])

  return null
}

function formatStopTime(iso?: string) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function TeamRouteStopMarker({
  stop,
  route,
  jobHref,
}: {
  stop: RouteStop
  route: CrewRoute
  jobHref?: string
}) {
  const isCompany = stop.kind === 'company'
  const color = CREW_ROUTE_COLORS[route.colorIndex]

  return (
    <MapMarker longitude={stop.longitude} latitude={stop.latitude}>
      <MarkerContent className="flex items-center justify-center">
        {isCompany ? (
          <div className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-white shadow-lg ring-2 ring-violet-500/20">
            <Building2 className="size-3.5" />
          </div>
        ) : (
          <div
            className="flex size-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-lg"
            style={{ backgroundColor: color }}
          >
            {stop.order}
          </div>
        )}
      </MarkerContent>
      <MarkerLabel position="top">
        {isCompany ? stop.subtitle || 'Depot' : stop.label}
      </MarkerLabel>
      <MarkerTooltip>
        <div className="space-y-0.5">
          <div className="font-medium">{stop.label}</div>
          {stop.subtitle && (
            <div className="text-background/80">{stop.subtitle}</div>
          )}
          {stop.startTime && (
            <div className="text-background/70">
              {formatStopTime(stop.startTime)}
              {stop.endTime ? ` – ${formatStopTime(stop.endTime)}` : ''}
            </div>
          )}
          <div className="text-background/60 text-xs">{stop.address}</div>
          {jobHref && (
            <Link href={jobHref} className="text-primary-foreground underline text-xs">
              View job
            </Link>
          )}
        </div>
      </MarkerTooltip>
    </MapMarker>
  )
}

function TeamJobCard({
  job,
  stopOrder,
  onStatusChanged,
}: {
  job: TeamMemberDashboardData['jobs'][number]
  stopOrder?: number
  onStatusChanged: () => void
}) {
  const [pending, startTransition] = useTransition()
  const fieldAction = getAvailableFieldJobAction(job.status)

  function runFieldAction() {
    if (!fieldAction) return
    startTransition(async () => {
      const result =
        fieldAction === 'start'
          ? await startFieldJobAction(job.id, job.clientId)
          : await completeFieldJobAction(job.id, job.clientId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message)
      onStatusChanged()
    })
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {stopOrder !== undefined && (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {stopOrder}
              </span>
            )}
            <h2 className="font-semibold text-base sm:text-lg tracking-tight truncate">
              {job.title}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground truncate mt-0.5">{job.clientName}</p>
        </div>
        <JobStatusBadge status={job.status} />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="size-4 shrink-0" />
          <span>{job.timeLabel}</span>
        </div>
        <div className="flex items-start gap-2 text-muted-foreground">
          <MapPin className="size-4 shrink-0 mt-0.5" />
          <span className="line-clamp-2">{job.address}</span>
        </div>
      </div>

      {fieldAction ? (
        <div className="mt-4">
          <Button
            type="button"
            size="lg"
            className={cn('w-full', MOBILE_FULL_WIDTH_BUTTON_CLASS)}
            disabled={pending}
            onClick={runFieldAction}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : fieldAction === 'start' ? (
              <Play className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {pending ? 'Updating…' : getFieldJobActionLabel(fieldAction)}
          </Button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <MapsNavigateButton
          address={job.address}
          className={cn('w-full sm:flex-1', MOBILE_FULL_WIDTH_BUTTON_CLASS)}
          size="lg"
        />
        <Link
          href={`/dashboard/clients/${job.clientId}/jobs/${job.id}`}
          className={buttonVariants({
            variant: 'outline',
            size: 'lg',
            className: cn('w-full sm:flex-1', MOBILE_FULL_WIDTH_BUTTON_CLASS),
          })}
        >
          View job
        </Link>
      </div>

      <div className="mt-3">
        <Badge variant="outline">{job.displayStatus}</Badge>
      </div>
    </Card>
  )
}

export function TeamPageClient({
  initialData,
  variant = 'team_member',
  embedded = false,
}: TeamPageClientProps) {
  const isSoloOwner = variant === 'solo_owner'
  const [data, setData] = useState(initialData)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [isOptimizing, startOptimize] = useTransition()

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    const result = await getTeamMemberDashboardAction()
    if (result.success) {
      setData(result.data)
      setError(null)
    } else {
      setError(result.error)
    }
    setIsRefreshing(false)
  }, [])

  const scheduledJobCount = useMemo(
    () => data.jobs.filter((job) => job.status === 'scheduled').length,
    [data.jobs]
  )
  const canOptimizeRoute =
    Boolean(data.crewId) && data.hasCrew && scheduledJobCount >= 2

  function handleOptimizeRoute() {
    if (!data.crewId || isOptimizing) return
    startOptimize(async () => {
      const result = await optimizeCrewDayRouteAction({
        crewId: data.crewId!,
        dayOffset: 0,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      if (result.updatedCount === 0) {
        toast.success(
          result.usedRoadOptimization
            ? 'Route order is already optimal'
            : 'Visit order looks good — no time changes needed'
        )
      } else {
        toast.success(
          result.usedRoadOptimization
            ? `Optimized route · updated ${result.updatedCount} job${result.updatedCount === 1 ? '' : 's'}`
            : `Reordered stops · updated ${result.updatedCount} job${result.updatedCount === 1 ? '' : 's'}`
        )
      }
      await refresh()
    })
  }

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

  const stopOrderByJobId = useMemo(() => {
    const map = new Map<string, number>()
    for (const stop of data.route?.stops || []) {
      if (stop.kind !== 'job') continue
      const jobId = stop.id.split(':').pop()
      if (jobId) map.set(jobId, stop.order)
    }
    return map
  }, [data.route])

  const routeCoordinates = data.route?.coordinates || []
  const routeColor = CREW_ROUTE_COLORS[data.route?.colorIndex ?? 0]
  const hasRoute = Boolean(data.route && data.route.coordinates.length >= 2)
  const hasWarnings = data.invalidAddresses.length > 0

  const driveDistance = formatRouteDistance(data.route?.distanceMeters ?? null)
  const driveDuration = formatRouteDuration(data.route?.durationSeconds ?? null)
  const contentInset = embedded ? '' : 'mx-4 sm:mx-6'

  return (
    <div
      className={
        embedded
          ? 'flex h-full min-h-0 flex-col pb-2'
          : 'flex h-full min-h-0 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-6'
      }
    >
      <div
        className={
          embedded
            ? 'flex shrink-0 flex-col gap-3 pb-3'
            : 'flex shrink-0 flex-col gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pt-6'
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            {!embedded ? (
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Day</h1>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {isSoloOwner
                ? data.dateLabel
                : `${data.crewName ? `${data.crewName} · ` : ''}${data.dateLabel}`}
            </p>
          </div>
          {isRefreshing && (
            <span className="text-xs text-muted-foreground shrink-0 pt-1">Updating…</span>
          )}
        </div>

        {hasRoute && driveDistance && driveDuration && (
          <p className="text-xs text-muted-foreground">
            {driveDistance} · {driveDuration}
            {!data.route?.followsRoads && ' (direct)'}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="hidden sm:flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              onClick={() => setViewMode('list')}
            >
              <List className="size-4" />
              List
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'map' ? 'secondary' : 'ghost'}
              onClick={() => setViewMode('map')}
            >
              <MapIcon className="size-4" />
              Map
            </Button>
          </div>

          {canOptimizeRoute ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(MOBILE_FULL_WIDTH_BUTTON_CLASS, 'sm:w-auto')}
              disabled={isOptimizing || isRefreshing}
              onClick={handleOptimizeRoute}
            >
              {isOptimizing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Route className="size-4" />
              )}
              {isOptimizing ? 'Optimizing…' : 'Optimize route'}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Card className={`${contentInset} p-8 text-center`}>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      ) : !data.hasCrew ? (
        <Card className={`${contentInset} p-8 text-center`}>
          <CalendarDays className="size-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold tracking-tight">
            {isSoloOwner ? 'Schedule not ready' : 'No crew assigned'}
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            {isSoloOwner
              ? 'Turn solo business mode off and on again in Settings → Company if your schedule does not load.'
              : 'Ask your company admin to assign you to a crew in the Crews page before jobs appear here.'}
          </p>
        </Card>
      ) : data.jobs.length === 0 ? (
        <Card className={`${contentInset} p-8 text-center`}>
          <CalendarDays className="size-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold tracking-tight">No jobs today</h2>
          <p className="text-sm text-muted-foreground mt-2">
            {isSoloOwner
              ? `You're all clear for ${data.dateLabel.toLowerCase()}. Open My Schedule in the sidebar to put unassigned jobs on your day, or create jobs from Clients.`
              : `You're all clear for ${data.dateLabel.toLowerCase()}.`}
          </p>
        </Card>
      ) : viewMode === 'map' ? (
        <MainPageCard className={`${contentInset} min-h-0 flex-1 gap-0 overflow-hidden p-0`}>
          <div
            className={cn(
              'relative isolate min-h-[50vh] flex-1 sm:min-h-0',
              MOBILE_MAP_MIN_HEIGHT_CLASS
            )}
          >
            {hasRoute ? (
              <>
                <div className="absolute inset-0 z-0">
                  <RouteMap center={[-98.5795, 39.8283]} zoom={4} className="h-full w-full">
                    <MapBounds coordinates={routeCoordinates} />
                    <MapControls showZoom position="bottom-right" />

                    {data.route && (
                      <MapRoute
                        id={data.route.crewId}
                        coordinates={data.route.coordinates}
                        color={routeColor}
                        width={4}
                        opacity={0.85}
                        showDirection
                        directionSpacing={80}
                      />
                    )}

                    {data.companyLocation && (
                      <MapMarker
                        longitude={data.companyLocation.longitude}
                        latitude={data.companyLocation.latitude}
                      >
                        <MarkerContent className="flex items-center justify-center">
                          <div className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-white shadow-lg ring-4 ring-violet-500/20">
                            <Building2 className="size-4" />
                          </div>
                        </MarkerContent>
                        <MarkerLabel position="top">{data.companyName}</MarkerLabel>
                      </MapMarker>
                    )}

                    {data.route?.stops.map((stop) => {
                      const jobId = stop.kind === 'job' ? stop.id.split(':').pop() : null
                      const job = jobId ? data.jobs.find((entry) => entry.id === jobId) : null
                      const jobHref = job
                        ? `/dashboard/clients/${job.clientId}/jobs/${job.id}`
                        : undefined

                      return (
                        <TeamRouteStopMarker
                          key={stop.id}
                          stop={stop}
                          route={data.route!}
                          jobHref={jobHref}
                        />
                      )
                    })}
                  </RouteMap>
                </div>

                {hasWarnings && (
                  <div className="pointer-events-auto absolute bottom-3 left-3 right-3 z-20 rounded-lg border border-amber-500/40 bg-background/95 backdrop-blur px-3 py-2 shadow-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 text-xs">
                        <p className="font-medium text-amber-900 dark:text-amber-200">
                          {data.invalidAddresses.length === 1
                            ? '1 stop could not be routed'
                            : `${data.invalidAddresses.length} stops could not be routed`}
                        </p>
                        <ul className="mt-1 space-y-0.5 text-amber-800/90 dark:text-amber-100/80">
                          {data.invalidAddresses.slice(0, 3).map((item) => (
                            <li key={item.id} className="truncate">
                              <span className="font-medium">{item.label}:</span> {item.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center bg-muted/20 px-4 text-center">
                <MapPin className="size-10 text-muted-foreground/60 mb-3" />
                <p className="text-sm font-medium">Map unavailable</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Jobs need valid client addresses to appear on the map. Use the list view and navigate from each job card.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setViewMode('list')}
                >
                  View list
                </Button>
              </div>
            )}
          </div>
        </MainPageCard>
      ) : (
        <div className={`${contentInset} flex min-h-0 flex-1 flex-col`}>
          <MainPageCardScroll contentClassName="flex flex-col gap-3 px-4 pb-4 sm:px-6 max-w-2xl mx-auto w-full">
            {data.jobs.map((job) => (
              <TeamJobCard
                key={job.id}
                job={job}
                stopOrder={stopOrderByJobId.get(job.id)}
                onStatusChanged={() => {
                  void refresh()
                }}
              />
            ))}
          </MainPageCardScroll>
        </div>
      )}

      {!embedded ? (
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-2">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
                viewMode === 'list' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <List className="size-5" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
                viewMode === 'map' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <MapIcon className="size-5" />
              Map
            </button>
          </div>
        </div>
      ) : (
        <div className="sm:hidden shrink-0 border-t bg-background pt-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'flex min-h-11 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
                viewMode === 'list'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              <List className="size-4" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={cn(
                'flex min-h-11 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
                viewMode === 'map'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              <MapIcon className="size-4" />
              Map
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function TeamPageSkeleton() {
  return (
    <div className="p-4 sm:p-6 flex flex-col gap-3 max-w-2xl mx-auto w-full">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-44 rounded-lg" />
      ))}
    </div>
  )
}