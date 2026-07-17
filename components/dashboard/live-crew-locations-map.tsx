'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { AlertTriangle, Building2, Check, MapPin } from 'lucide-react'
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerLabel,
  MarkerTooltip,
  useMap,
} from '@/components/ui/map'
import type { DashboardMapData } from '@/lib/dashboard-map'
import {
  DESKTOP_MAP_SURFACE_CLASS,
  MOBILE_MAP_MIN_HEIGHT_CLASS,
} from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'

const CREW_MARKER_COLORS = [
  'bg-blue-500 ring-blue-500/20',
  'bg-green-500 ring-green-500/20',
  'bg-orange-500 ring-orange-500/20',
  'bg-cyan-500 ring-cyan-500/20',
  'bg-pink-500 ring-pink-500/20',
]

const DEFAULT_JOB_MARKER_COLOR = 'bg-slate-500 ring-slate-500/20'

const MAP_FRAME_CLASS = cn(
  'relative isolate w-full overflow-hidden rounded-lg border',
  DESKTOP_MAP_SURFACE_CLASS,
  MOBILE_MAP_MIN_HEIGHT_CLASS
)

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
      { padding: 72, maxZoom: 13, duration: 0 }
    )
  }, [map, isLoaded, coordinates])

  return null
}

interface LiveCrewLocationsMapProps {
  data: DashboardMapData | null
  isLoading?: boolean
  error?: string | null
}

export function LiveCrewLocationsMap({
  data,
  isLoading = false,
  error = null,
}: LiveCrewLocationsMapProps) {
  const coordinates = useMemo(
    () =>
      (data?.markers || []).map(
        (marker) => [marker.longitude, marker.latitude] as [number, number]
      ),
    [data?.markers]
  )

  const crewColorMap = useMemo(() => {
    const colors = new globalThis.Map<string, string>()
    let index = 0
    for (const marker of data?.markers || []) {
      if (marker.kind === 'job' && marker.crewId && !colors.has(marker.crewId)) {
        colors.set(
          marker.crewId,
          CREW_MARKER_COLORS[index % CREW_MARKER_COLORS.length]
        )
        index += 1
      }
    }
    return colors
  }, [data?.markers])

  const isUpcomingPreview = data?.mode === 'upcoming_open_days'
  const hasMarkers = (data?.markers.length ?? 0) > 0
  const hasWarnings = (data?.invalidAddresses.length ?? 0) > 0

  return (
    <div className="flex w-full flex-col gap-2 md:min-h-0 md:flex-1">
      {hasWarnings && !isLoading && !error && data ? (
        <div className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="min-w-0 text-xs">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                {data.invalidAddresses.length === 1
                  ? '1 address could not be shown on the map'
                  : `${data.invalidAddresses.length} addresses could not be shown on the map`}
              </p>
              <ul className="mt-1 space-y-1 text-amber-800/90 dark:text-amber-100/80">
                {data.invalidAddresses.map((item) => (
                  <li key={item.id}>
                    <span className="font-medium">{item.label}:</span>{' '}
                    {item.address ? `"${item.address}" — ` : ''}
                    {item.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-amber-800/80 dark:text-amber-100/70">
                Update company addresses in{' '}
                <Link href="/dashboard/settings" className="text-primary hover:underline">
                  Settings
                </Link>{' '}
                and client addresses on each client record.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className={MAP_FRAME_CLASS}>
        {isLoading ? (
          <div className="flex h-full items-center justify-center bg-muted/20">
            <p className="text-sm text-muted-foreground">Loading job sites…</p>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center border-dashed">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : !data ? (
          <div className="flex h-full items-center justify-center border-dashed">
            <p className="text-sm text-muted-foreground">Map data unavailable.</p>
          </div>
        ) : hasMarkers ? (
          <div className="absolute inset-0">
            <Map center={[-98.5795, 39.8283]} zoom={4} className="h-full w-full">
              <MapBounds coordinates={coordinates} />
              <MapControls showZoom position="bottom-right" />

              {data.markers.map((marker) => {
                const isCompany = marker.kind === 'company'
                const isCompleted = marker.kind === 'job' && Boolean(marker.completed)
                const isInProgress =
                  marker.kind === 'job' &&
                  !isCompleted &&
                  marker.status === 'in_progress'
                const crewColor =
                  marker.crewId && crewColorMap.get(marker.crewId)
                    ? crewColorMap.get(marker.crewId)
                    : DEFAULT_JOB_MARKER_COLOR

                return (
                  <MapMarker
                    key={marker.id}
                    longitude={marker.longitude}
                    latitude={marker.latitude}
                  >
                    <MarkerContent className="flex items-center justify-center">
                      {isCompany ? (
                        <div className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-white shadow-lg ring-4 ring-violet-500/20">
                          <Building2 className="size-4" />
                        </div>
                      ) : (
                        <div
                          className={cn(
                            'flex items-center justify-center rounded-full border-2 border-white shadow-lg ring-4',
                            crewColor,
                            isInProgress ? 'size-5' : 'size-4',
                            isCompleted && 'opacity-55 saturate-50'
                          )}
                        >
                          {isCompleted ? (
                            <Check className="size-2.5 text-white" strokeWidth={3} />
                          ) : null}
                        </div>
                      )}
                    </MarkerContent>
                    <MarkerLabel position="top">{marker.label}</MarkerLabel>
                    <MarkerTooltip>
                      <div className="space-y-0.5">
                        <div className="font-medium">{marker.label}</div>
                        {marker.subtitle && (
                          <div className="text-background/80">{marker.subtitle}</div>
                        )}
                        <div className="text-background/70">{marker.address}</div>
                      </div>
                    </MarkerTooltip>
                  </MapMarker>
                )
              })}
            </Map>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-muted/20 px-4 text-center">
            <MapPin className="mb-2 size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              {isUpcomingPreview
                ? 'No upcoming job sites in the next open days.'
                : 'No job sites to show for today yet.'}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {isUpcomingPreview
                ? data.previewRangeLabel
                  ? `No scheduled jobs with addresses between ${data.previewRangeLabel}.`
                  : 'Schedule jobs on your next open days to preview them here.'
                : 'Job site pins appear for today\u2019s scheduled jobs when client addresses are on file. Add your company address in Settings to show your office location too.'}
            </p>
            <Link
              href="/dashboard/settings"
              className="mt-2 text-xs text-primary hover:underline"
            >
              Open Settings
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}