'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { AlertTriangle, Building2, MapPin } from 'lucide-react'
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

const CREW_MARKER_COLORS = [
  'bg-blue-500 ring-blue-500/20',
  'bg-green-500 ring-green-500/20',
  'bg-orange-500 ring-orange-500/20',
  'bg-cyan-500 ring-cyan-500/20',
  'bg-pink-500 ring-pink-500/20',
]

const DEFAULT_JOB_MARKER_COLOR = 'bg-slate-500 ring-slate-500/20'

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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-lg border bg-muted/20">
        <p className="text-sm text-muted-foreground">Loading job sites…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">Map data unavailable.</p>
      </div>
    )
  }

  const hasMarkers = data.markers.length > 0
  const hasWarnings = data.invalidAddresses.length > 0

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">
      {hasWarnings && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 shrink-0">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
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
      )}

      <div className="flex-1 min-h-0 rounded-lg border overflow-hidden relative">
        {hasMarkers ? (
          <Map center={[-98.5795, 39.8283]} zoom={4} className="h-full w-full">
            <MapBounds coordinates={coordinates} />
            <MapControls showZoom position="bottom-right" />

            {data.markers.map((marker) => {
              const isCompany = marker.kind === 'company'
              const isInProgress = marker.kind === 'job' && marker.status === 'in_progress'
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
                        className={`rounded-full border-2 border-white shadow-lg ring-4 ${crewColor} ${
                          isInProgress ? 'size-5' : 'size-4'
                        }`}
                      />
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
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-muted/20 px-4 text-center">
            <MapPin className="size-8 text-muted-foreground/60 mb-2" />
            <p className="text-sm text-muted-foreground">
              No job sites to show for today yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Job site pins appear for today&apos;s scheduled jobs when client addresses are on
              file. Add your company address in Settings to show your office location too.
            </p>
            <Link
              href="/dashboard/settings"
              className="text-xs text-primary hover:underline mt-2"
            >
              Open Settings
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}