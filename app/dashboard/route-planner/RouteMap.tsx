'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icons for Leaflet in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

interface Stop {
  job: { title: string }
  lat: number
  lng: number
  address: string
}

interface RouteMapProps {
  stops: Stop[]
  geometry?: any // GeoJSON LineString
}

export default function RouteMap({ stops, geometry }: RouteMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current).setView([stops[0]?.lat || 40, stops[0]?.lng || -74], 11)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Add markers and route
  useEffect(() => {
    const map = mapRef.current
    if (!map || stops.length === 0) return

    // Clear previous layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer)
      }
    })

    // Add markers
    stops.forEach((stop, index) => {
      const marker = L.marker([stop.lat, stop.lng])
        .bindPopup(`<strong>${index + 1}. ${stop.job.title}</strong><br>${stop.address}`)
        .addTo(map)
    })

    // Add route if available
    if (geometry?.coordinates) {
      const latlngs = geometry.coordinates.map((c: number[]) => [c[1], c[0]])
      L.polyline(latlngs as any, {
        color: '#000000',
        weight: 4,
        opacity: 0.85,
      }).addTo(map)
    }

    // Fit bounds
    const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng]))
    map.fitBounds(bounds, { padding: [30, 30] })
  }, [stops, geometry])

  return <div ref={mapContainerRef} className="h-full w-full" />
}
