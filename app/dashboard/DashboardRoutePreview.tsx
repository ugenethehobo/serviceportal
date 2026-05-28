'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

interface PreviewPoint {
  lat: number
  lng: number
  title: string
}

interface DashboardRoutePreviewProps {
  points: PreviewPoint[]
}

export default function DashboardRoutePreview({ points }: DashboardRoutePreviewProps) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || points.length === 0) return

    // Clear previous markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer)
      }
    })

    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]))

    points.forEach((point, index) => {
      L.marker([point.lat, point.lng])
        .bindTooltip(`${index + 1}. ${point.title}`, { permanent: false, direction: 'top' })
        .addTo(map)
    })

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13)
    } else {
      map.fitBounds(bounds, { padding: [10, 10] })
    }
  }, [points])

  if (points.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground bg-muted/50">
        No stops with coordinates yet
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
