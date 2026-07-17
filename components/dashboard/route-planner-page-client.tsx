'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  Route,
} from 'lucide-react'
import { toast } from 'sonner'
import { getRoutePlannerDataAction } from '@/app/action'
import { optimizeCrewDayRouteAction } from '@/app/route-optimize-actions'
import { MainPageCard } from '@/components/ui/main-page-card'
import { Button } from '@/components/ui/button'
import {
  Map,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerLabel,
  MarkerTooltip,
  useMap,
} from '@/components/ui/map'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  formatRouteDistance,
  formatRouteDuration,
} from '@/lib/road-routing'
import {
  ROUTE_PLANNER_MOBILE_MAP_CLASS,
  ROUTE_PLANNER_MOBILE_PAGE_CLASS,
  MOBILE_FULL_WIDTH_BUTTON_CLASS,
  MOBILE_PAGE_ROOT_CLASS,
} from '@/lib/mobile-layout'
import {
  CREW_ROUTE_COLORS,
  type CrewRoute,
  type RoutePlannerData,
  type RouteStop,
} from '@/lib/route-planner'
import { cn } from '@/lib/utils'

function MapBounds({ coordinates }: { coordinates: [number, number][] }) {
  const { map, isLoaded } = useMap()

  useEffect(() => {
    if (!isLoaded || !map || coordinates.length === 0) return

    if (coordinates.length === 1) {
      map.flyTo({ center: coordinates[0], zoom: 12, duration: 0 })
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
      { padding: 80, maxZoom: 13, duration: 0 }
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

function RouteStopMarker({
  stop,
  route,
  visible,
}: {
  stop: RouteStop
  route: CrewRoute
  visible: boolean
}) {
  if (!visible) return null

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
            className="flex size-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-lg"
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
          <div className="text-background/70">{route.crewName}</div>
          {stop.startTime && (
            <div className="text-background/70">
              {formatStopTime(stop.startTime)}
              {stop.endTime ? ` – ${formatStopTime(stop.endTime)}` : ''}
            </div>
          )}
          <div className="text-background/60 text-xs">{stop.address}</div>
        </div>
      </MarkerTooltip>
    </MapMarker>
  )
}

function DesktopCrewsPanel({
  routes,
  visibleCrews,
  onToggle,
  optimizingCrewId,
  onOptimize,
}: {
  routes: CrewRoute[]
  visibleCrews: Set<string>
  onToggle: (crewId: string) => void
  optimizingCrewId: string | null
  onOptimize: (crewId: string) => void
}) {
  return (
    <ScrollArea
      className="pointer-events-auto absolute top-3 left-3 z-20 w-64 max-h-[calc(100%-1.5rem)] rounded-lg border bg-background/95 shadow-lg backdrop-blur"
      viewportClassName="scroll-fade"
    >
      <div className="border-b px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Crews
        </p>
      </div>
      <ul className="space-y-1 p-2">
        {routes.map((route) => {
          const isVisible = visibleCrews.has(route.crewId)
          const color = CREW_ROUTE_COLORS[route.colorIndex]
          const driveDistance = formatRouteDistance(route.distanceMeters)
          const driveDuration = formatRouteDuration(route.durationSeconds)
          const canOptimize = route.jobCount >= 2
          const isOptimizing = optimizingCrewId === route.crewId

          return (
            <li key={route.crewId} className="space-y-1">
              <button
                type="button"
                onClick={() => onToggle(route.crewId)}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  isVisible
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full border border-white/50"
                    style={{
                      backgroundColor: isVisible ? color : 'transparent',
                      borderColor: color,
                    }}
                  />
                  <span className="flex-1 truncate font-medium">{route.crewName}</span>
                  <span className="shrink-0 text-xs opacity-80">
                    {route.jobCount} {route.jobCount === 1 ? 'stop' : 'stops'}
                  </span>
                </div>
                {driveDistance && driveDuration && (
                  <p className="mt-0.5 pl-5 text-[11px] opacity-80">
                    {driveDistance} · {driveDuration}
                    {!route.followsRoads && ' (direct)'}
                  </p>
                )}
              </button>
              {canOptimize ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-full text-xs"
                  disabled={optimizingCrewId != null}
                  onClick={() => onOptimize(route.crewId)}
                >
                  {isOptimizing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Route className="size-3.5" />
                  )}
                  {isOptimizing ? 'Optimizing…' : 'Optimize'}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}

function MobileRouteStopsPanel({
  routes,
  visibleCrews,
  onToggle,
  optimizingCrewId,
  onOptimize,
}: {
  routes: CrewRoute[]
  visibleCrews: Set<string>
  onToggle: (crewId: string) => void
  optimizingCrewId: string | null
  onOptimize: (crewId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const visibleRoutes = useMemo(
    () => routes.filter((route) => visibleCrews.has(route.crewId)),
    [routes, visibleCrews]
  )

  const totalJobStops = useMemo(
    () =>
      visibleRoutes.reduce(
        (sum, route) => sum + route.stops.filter((stop) => stop.kind === 'job').length,
        0
      ),
    [visibleRoutes]
  )

  return (
    <div className="pointer-events-auto flex w-full min-w-0 flex-col gap-1.5 md:hidden">
      {expanded ? (
        <div className="overflow-hidden rounded-lg border bg-background/94 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {totalJobStops} {totalJobStops === 1 ? 'stop' : 'stops'} · {visibleRoutes.length}{' '}
              {visibleRoutes.length === 1 ? 'crew' : 'crews'}
            </p>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="shrink-0 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <ScrollArea className="max-h-[38vh]" viewportClassName="scroll-fade">
            <div className="space-y-2 p-1.5">
              {visibleRoutes.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  Select a crew below to view stops.
                </p>
              ) : (
                visibleRoutes.map((route) => {
                  const color = CREW_ROUTE_COLORS[route.colorIndex]
                  const driveDistance = formatRouteDistance(route.distanceMeters)
                  const driveDuration = formatRouteDuration(route.durationSeconds)
                  const jobStops = route.stops.filter((stop) => stop.kind === 'job')

                  const canOptimize = route.jobCount >= 2
                  const isOptimizing = optimizingCrewId === route.crewId

                  return (
                    <div
                      key={route.crewId}
                      className="overflow-hidden rounded-md border border-border/60 bg-muted/15"
                    >
                      <div className="flex items-center gap-2 border-b border-border/50 bg-background/50 px-2 py-1.5">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {route.crewName}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {jobStops.length} {jobStops.length === 1 ? 'stop' : 'stops'}
                        </span>
                      </div>
                      {driveDistance && driveDuration ? (
                        <p className="border-b border-border/40 px-2 py-1 text-[10px] text-muted-foreground">
                          {driveDistance} · {driveDuration}
                          {!route.followsRoads && ' (direct)'}
                        </p>
                      ) : null}
                      {canOptimize ? (
                        <div className="border-b border-border/40 px-2 py-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(
                              'h-9 w-full text-xs',
                              MOBILE_FULL_WIDTH_BUTTON_CLASS
                            )}
                            disabled={optimizingCrewId != null}
                            onClick={() => onOptimize(route.crewId)}
                          >
                            {isOptimizing ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Route className="size-3.5" />
                            )}
                            {isOptimizing ? 'Optimizing…' : 'Optimize route'}
                          </Button>
                        </div>
                      ) : null}
                      <ol className="divide-y divide-border/40 px-2 py-0.5">
                        {route.stops.map((stop) => (
                          <li key={stop.id} className="flex items-start gap-2 py-1.5">
                            {stop.kind === 'company' ? (
                              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white">
                                <Building2 className="size-2.5" />
                              </span>
                            ) : (
                              <span
                                className="flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                                style={{ backgroundColor: color }}
                              >
                                {stop.order}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-medium leading-tight">
                                {stop.label}
                              </p>
                              {stop.subtitle ? (
                                <p className="truncate text-[10px] text-muted-foreground">
                                  {stop.subtitle}
                                </p>
                              ) : null}
                              {stop.startTime ? (
                                <p className="text-[10px] text-muted-foreground">
                                  {formatStopTime(stop.startTime)}
                                  {stop.endTime ? ` – ${formatStopTime(stop.endTime)}` : ''}
                                </p>
                              ) : null}
                              {stop.kind === 'job' ? (
                                <p className="truncate text-[10px] text-muted-foreground/80">
                                  {stop.address}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>
      ) : null}

      <div className="flex min-w-0 items-center gap-1.5 rounded-full border bg-background/88 px-2 py-1 shadow-md backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
          />
          <span>Stops</span>
          <span className="text-muted-foreground">({totalJobStops})</span>
        </button>
        <div className="h-4 w-px shrink-0 bg-border" />
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {routes.map((route) => {
            const isVisible = visibleCrews.has(route.crewId)
            const color = CREW_ROUTE_COLORS[route.colorIndex]

            return (
              <button
                key={route.crewId}
                type="button"
                onClick={() => onToggle(route.crewId)}
                className={cn(
                  'flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] transition-colors',
                  isVisible
                    ? 'border-transparent bg-accent text-accent-foreground'
                    : 'border-border/60 bg-background/70 text-muted-foreground hover:bg-muted/50'
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="max-w-[4.5rem] truncate font-medium">{route.crewName}</span>
                <span className="opacity-70">{route.jobCount}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DesktopRouteWarnings({
  invalidAddresses,
}: {
  invalidAddresses: RoutePlannerData['invalidAddresses']
}) {
  return (
    <div className="pointer-events-auto absolute right-3 bottom-3 left-3 z-20 max-w-xl rounded-lg border border-amber-500/40 bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0 text-xs">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            {invalidAddresses.length === 1
              ? '1 stop could not be routed'
              : `${invalidAddresses.length} stops could not be routed`}
          </p>
          <ScrollArea className="mt-1 max-h-24" viewportClassName="scroll-fade">
            <ul className="space-y-0.5 text-amber-800/90 dark:text-amber-100/80">
              {invalidAddresses.map((item) => (
                <li key={item.id} className="truncate">
                  <span className="font-medium">{item.label}:</span> {item.reason}
                </li>
              ))}
            </ul>
          </ScrollArea>
          <Link
            href="/dashboard/settings"
            className="mt-1 inline-block text-primary hover:underline"
          >
            Update addresses in Settings
          </Link>
        </div>
      </div>
    </div>
  )
}

function MobileRouteWarnings({
  invalidAddresses,
}: {
  invalidAddresses: RoutePlannerData['invalidAddresses']
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="pointer-events-auto w-full md:hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-1.5 rounded-md border border-amber-500/40 bg-background/90 px-2 py-1 text-[11px] shadow-sm backdrop-blur-sm"
      >
        <AlertTriangle className="size-3 shrink-0 text-amber-600" />
        <span className="truncate font-medium text-amber-900 dark:text-amber-200">
          {invalidAddresses.length === 1
            ? '1 routing issue'
            : `${invalidAddresses.length} routing issues`}
        </span>
        <ChevronUp
          className={cn('ml-auto size-3 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div className="mt-1 overflow-hidden rounded-md border border-amber-500/30 bg-background/92 px-2 py-1.5 text-[10px] backdrop-blur-sm">
          <ScrollArea className="max-h-20" viewportClassName="scroll-fade">
            <ul className="space-y-0.5 text-amber-800/90 dark:text-amber-100/80">
              {invalidAddresses.map((item) => (
                <li key={item.id} className="truncate">
                  <span className="font-medium">{item.label}:</span> {item.reason}
                </li>
              ))}
            </ul>
          </ScrollArea>
          <Link
            href="/dashboard/settings"
            className="mt-1 inline-block text-primary hover:underline"
          >
            Settings
          </Link>
        </div>
      ) : null}
    </div>
  )
}

interface RoutePlannerPageClientProps {
  initialData: RoutePlannerData
}

export function RoutePlannerPageClient({ initialData }: RoutePlannerPageClientProps) {
  const [data, setData] = useState(initialData)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [optimizingCrewId, setOptimizingCrewId] = useState<string | null>(null)
  const [, startOptimize] = useTransition()
  const [visibleCrews, setVisibleCrews] = useState<Set<string>>(() =>
    new Set(initialData.routes.map((route) => route.crewId))
  )

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    const result = await getRoutePlannerDataAction()
    if (result.success) {
      setData(result.data)
      setError(null)
      setVisibleCrews((prev) => {
        const routeIds = result.data.routes.map((route) => route.crewId)
        const kept = routeIds.filter((id) => prev.has(id))
        return new Set(kept.length > 0 ? kept : routeIds)
      })
    } else {
      setError(result.error || 'Failed to load routes')
    }
    setIsRefreshing(false)
  }, [])

  const handleOptimize = useCallback(
    (crewId: string) => {
      if (optimizingCrewId) return
      setOptimizingCrewId(crewId)
      startOptimize(async () => {
        try {
          const result = await optimizeCrewDayRouteAction({ crewId, dayOffset: 0 })
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
              `Optimized ${result.updatedCount} job${result.updatedCount === 1 ? '' : 's'}`
            )
          }
          await refresh()
        } finally {
          setOptimizingCrewId(null)
        }
      })
    },
    [optimizingCrewId, refresh]
  )

  useEffect(() => {
    const interval = setInterval(refresh, 120_000)
    return () => clearInterval(interval)
  }, [refresh])

  const visibleRoutes = useMemo(
    () => data.routes.filter((route) => visibleCrews.has(route.crewId)),
    [data.routes, visibleCrews]
  )

  const allCoordinates = useMemo(() => {
    const coords: [number, number][] = []
    for (const route of visibleRoutes) {
      for (const coord of route.coordinates) {
        coords.push(coord)
      }
    }
    return coords
  }, [visibleRoutes])

  const toggleCrew = (crewId: string) => {
    setVisibleCrews((prev) => {
      const next = new Set(prev)
      if (next.has(crewId)) {
        if (next.size > 1) next.delete(crewId)
      } else {
        next.add(crewId)
      }
      return next
    })
  }

  const hasRoutes = data.routes.length > 0
  const hasWarnings = data.invalidAddresses.length > 0

  return (
    <div className={cn(MOBILE_PAGE_ROOT_CLASS, ROUTE_PLANNER_MOBILE_PAGE_CLASS)}>
      <div className="mb-6 flex shrink-0 items-center justify-between max-md:mb-0 max-md:gap-1">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight max-md:text-lg">Route Planner</h1>
          <p className="text-muted-foreground max-md:truncate max-md:text-xs">
            {data.dateLabel} · {data.companyName} · driving routes from depot
          </p>
        </div>
        {isRefreshing && (
          <span className="shrink-0 text-sm text-muted-foreground max-md:text-xs">
            Updating…
          </span>
        )}
      </div>

      <MainPageCard className="gap-0 overflow-hidden p-0 max-md:min-h-0 max-md:!flex-1">
        <div
          className={cn(
            'relative isolate min-h-0 flex-1',
            ROUTE_PLANNER_MOBILE_MAP_CLASS
          )}
        >
          {error ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : hasRoutes ? (
            <>
              <div className="absolute inset-0 z-0">
                <Map center={[-98.5795, 39.8283]} zoom={4} className="h-full w-full">
                  <MapBounds coordinates={allCoordinates} />
                  <MapControls
                    showZoom
                    position="bottom-right"
                    className="max-md:!top-2 max-md:!right-2 max-md:!bottom-auto"
                  />

                  {visibleRoutes.map((route) => (
                    <MapRoute
                      key={route.crewId}
                      id={route.crewId}
                      coordinates={route.coordinates}
                      color={CREW_ROUTE_COLORS[route.colorIndex]}
                      width={4}
                      opacity={0.85}
                      showDirection
                      directionSpacing={80}
                    />
                  ))}

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
                      <MarkerTooltip>
                        <div className="space-y-0.5">
                          <div className="font-medium">{data.companyName}</div>
                          <div className="text-background/80">Start & end for all crews</div>
                        </div>
                      </MarkerTooltip>
                    </MapMarker>
                  )}

                  {visibleRoutes.map((route) =>
                    route.stops
                      .filter((stop) => stop.kind === 'job')
                      .map((stop) => (
                        <RouteStopMarker
                          key={stop.id}
                          stop={stop}
                          route={route}
                          visible={visibleCrews.has(route.crewId)}
                        />
                      ))
                  )}
                </Map>
              </div>

              <div className="pointer-events-none absolute inset-0 z-20 md:hidden">
                <div className="absolute top-2 right-14 left-2 flex flex-col items-stretch">
                  <MobileRouteStopsPanel
                    routes={data.routes}
                    visibleCrews={visibleCrews}
                    onToggle={toggleCrew}
                    optimizingCrewId={optimizingCrewId}
                    onOptimize={handleOptimize}
                  />
                </div>
                {hasWarnings ? (
                  <div className="absolute right-2 bottom-2 left-2">
                    <MobileRouteWarnings invalidAddresses={data.invalidAddresses} />
                  </div>
                ) : null}
              </div>

              <div className="pointer-events-none absolute inset-0 z-20 hidden md:block">
                <DesktopCrewsPanel
                  routes={data.routes}
                  visibleCrews={visibleCrews}
                  onToggle={toggleCrew}
                  optimizingCrewId={optimizingCrewId}
                  onOptimize={handleOptimize}
                />
                {hasWarnings ? (
                  <DesktopRouteWarnings invalidAddresses={data.invalidAddresses} />
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-muted/20 px-4 text-center">
              <MapPin className="mb-3 size-10 text-muted-foreground/60" />
              <p className="text-sm font-medium">No routes for today</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Assign crews to scheduled jobs with client addresses to see daily routes.
              </p>
            </div>
          )}
        </div>
      </MainPageCard>
    </div>
  )
}