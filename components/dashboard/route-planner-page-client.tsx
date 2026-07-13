'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Building2, MapPin } from 'lucide-react'
import { getRoutePlannerDataAction } from '@/app/action'
import { MainPageCard } from '@/components/ui/main-page-card'
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
  CREW_ROUTE_COLORS,
  type CrewRoute,
  type RoutePlannerData,
  type RouteStop,
} from '@/lib/route-planner'
import { MOBILE_PAGE_ROOT_CLASS } from '@/lib/mobile-layout'

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

interface RoutePlannerPageClientProps {
  initialData: RoutePlannerData
}

export function RoutePlannerPageClient({ initialData }: RoutePlannerPageClientProps) {
  const [data, setData] = useState(initialData)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
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
    <div className={MOBILE_PAGE_ROOT_CLASS}>
      <div className="flex items-center justify-between mb-6 shrink-0 max-md:mb-4 max-md:flex-col max-md:items-start max-md:gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight max-md:text-2xl">Route Planner</h1>
          <p className="text-muted-foreground">
            {data.dateLabel} · {data.companyName} · driving routes from depot
          </p>
        </div>
        {isRefreshing && (
          <span className="text-sm text-muted-foreground shrink-0">Updating…</span>
        )}
      </div>

      <MainPageCard className="gap-0 overflow-hidden p-0">
        <div className="flex-1 relative min-h-0 isolate">
          {error ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : hasRoutes ? (
            <>
              <div className="absolute inset-0 z-0">
                <Map center={[-98.5795, 39.8283]} zoom={4} className="h-full w-full">
                  <MapBounds coordinates={allCoordinates} />
                  <MapControls showZoom position="bottom-right" />

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

              <div className="pointer-events-none absolute inset-0 z-20">
                <ScrollArea
                  className="pointer-events-auto absolute top-3 left-3 w-64 max-h-[calc(100%-1.5rem)] rounded-lg border bg-background/95 backdrop-blur shadow-lg max-md:bottom-3 max-md:left-3 max-md:right-3 max-md:top-auto max-md:w-auto max-md:max-h-[40vh]"
                  viewportClassName="scroll-fade"
                >
                  <div className="px-3 py-2 border-b">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Crews
                    </p>
                  </div>
                  <ul className="p-2 space-y-1">
                    {data.routes.map((route) => {
                      const isVisible = visibleCrews.has(route.crewId)
                      const color = CREW_ROUTE_COLORS[route.colorIndex]

                      const driveDistance = formatRouteDistance(route.distanceMeters)
                      const driveDuration = formatRouteDuration(route.durationSeconds)

                      return (
                        <li key={route.crewId}>
                          <button
                            type="button"
                            onClick={() => toggleCrew(route.crewId)}
                            className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors max-md:min-h-11 max-md:py-2.5 ${
                              isVisible
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-muted/60'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="size-3 rounded-full shrink-0 border border-white/50"
                                style={{ backgroundColor: isVisible ? color : 'transparent', borderColor: color }}
                              />
                              <span className="flex-1 truncate font-medium">{route.crewName}</span>
                              <span className="text-xs opacity-80 shrink-0">
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
                        </li>
                      )
                    })}
                  </ul>
                </ScrollArea>

                {hasWarnings && (
                  <div className="pointer-events-auto absolute bottom-3 left-3 right-3 max-w-xl rounded-lg border border-amber-500/40 bg-background/95 backdrop-blur px-3 py-2 shadow-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 text-xs">
                        <p className="font-medium text-amber-900 dark:text-amber-200">
                          {data.invalidAddresses.length === 1
                            ? '1 stop could not be routed'
                            : `${data.invalidAddresses.length} stops could not be routed`}
                        </p>
                        <ScrollArea className="mt-1 max-h-24" viewportClassName="scroll-fade">
                          <ul className="space-y-0.5 text-amber-800/90 dark:text-amber-100/80">
                            {data.invalidAddresses.map((item) => (
                              <li key={item.id} className="truncate">
                                <span className="font-medium">{item.label}:</span>{' '}
                                {item.reason}
                              </li>
                            ))}
                          </ul>
                        </ScrollArea>
                        <Link
                          href="/dashboard/settings"
                          className="inline-block mt-1 text-primary hover:underline"
                        >
                          Update addresses in Settings
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-muted/20 px-4 text-center">
              <MapPin className="size-10 text-muted-foreground/60 mb-3" />
              <p className="text-sm font-medium">No routes for today</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Assign crews to scheduled jobs with client addresses to see daily routes.
              </p>
            </div>
          )}
        </div>
      </MainPageCard>
    </div>
  )
}