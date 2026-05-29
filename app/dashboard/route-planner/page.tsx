'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import dynamic from 'next/dynamic'

// Dynamically import the map to avoid SSR issues with Leaflet
const RouteMap = dynamic(() => import('./RouteMap'), { ssr: false })

interface JobWithClient {
  id: string
  client_id: string
  title: string
  scheduled_date: string
  status: string
  clients: {
    id: string
    name: string
    address: string | null
    latitude: number | null
    longitude: number | null
  } | null
}

interface Stop {
  job: JobWithClient
  lat: number
  lng: number
  address: string
}

export default function RoutePlannerPage() {
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<JobWithClient[]>([])
  const [stops, setStops] = useState<Stop[]>([])
  const [failedToGeocode, setFailedToGeocode] = useState<JobWithClient[]>([])
  const [manualCoords, setManualCoords] = useState<Record<string, { lat: string; lng: string }>>({})
  const [optimizedOrder, setOptimizedOrder] = useState<number[]>([])
  const [routeGeometry, setRouteGeometry] = useState<any>(null)
  const [totalDistance, setTotalDistance] = useState<number | null>(null)
  const [totalTime, setTotalTime] = useState<number | null>(null)
  const [legDurations, setLegDurations] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [geocodingConfig, setGeocodingConfig] = useState<{
    mapboxToken: string
  }>({ mapboxToken: '' })

  const [companyInfo, setCompanyInfo] = useState<{
    address: string
    lat: number | null
    lng: number | null
  }>({ address: '', lat: null, lng: null })

  const [geocodingStatus, setGeocodingStatus] = useState<Record<string, 'pending' | 'success' | 'error'>>({})
  const [configLoaded, setConfigLoaded] = useState(false)

  const [confirmDialog, setConfirmDialog] = useState<any>({ open: false })

  const supabase = createClient()

  useEffect(() => {
    const initialize = async () => {
      // Await config so we have fresh token + company address
      const settings = await loadGeocodingConfig()
      const loadedJobs = await loadTodaysJobs()
      startAutomaticRoutePlanning(
        loadedJobs || [], 
        settings?.mapbox_access_token || '',
        settings?.company_address || ''
      )
    }
    initialize()
  }, [])

  const loadGeocodingConfig = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setConfigLoaded(true)
      return null
    }

    const { data: settings } = await supabase
      .from('company_settings')
      .select('mapbox_access_token, route_planner_enabled, company_address')
      .eq('user_id', user.id)
      .single()

    if (settings) {
      setGeocodingConfig({
        mapboxToken: settings.mapbox_access_token || '',
      })
      setCompanyInfo({
        address: settings.company_address || '',
        lat: null,
        lng: null,
      })
    }

    setConfigLoaded(true)
    return settings
  }

  const loadTodaysJobs = async () => {
    setLoading(true)
    setError(null)

    // Use a slightly wider range and filter by calendar date client-side.
    // This avoids timezone edge cases where local "today" jobs get excluded.
    const now = new Date()
    const startRange = new Date(now)
    startRange.setDate(startRange.getDate() - 1)   // yesterday
    const endRange = new Date(now)
    endRange.setDate(endRange.getDate() + 2)       // day after tomorrow

    const { data, error } = await supabase
      .from('jobs')
      .select(`
        id,
        client_id,
        title,
        scheduled_date,
        status,
        clients (id, name, address, latitude, longitude)
      `)
      .not('scheduled_date', 'is', null)
      .gte('scheduled_date', startRange.toISOString())
      .lte('scheduled_date', endRange.toISOString())
      .order('scheduled_date')

    if (error) {
      setError('Failed to load jobs')
      console.error(error)
      setLoading(false)
      return []
    } else {
      const todayStr = new Date().toDateString()

      const filtered = (data || []).filter((j: any) => {
        const hasAddress = j.clients?.address
        const isToday = j.scheduled_date && new Date(j.scheduled_date).toDateString() === todayStr
        return hasAddress && isToday
      })

      setJobs(filtered as any)
      setLoading(false)
      return filtered
    }
  }

  // Fully automatic route planning flow
  const startAutomaticRoutePlanning = async (loadedJobs: any[], passedToken: string = '', passedCompanyAddress: string = '') => {
    const currentJobs = loadedJobs && loadedJobs.length > 0 ? loadedJobs : jobs

    if (currentJobs.length === 0) {
      setError("No jobs scheduled for today with addresses on the client record. Make sure your test jobs have a valid address saved on the client and are scheduled for today's date.")
      return
    }

    // Prefer the token passed from the await, fall back to state
    const token = passedToken || geocodingConfig.mapboxToken
    if (!token) {
      setError("Mapbox token is required for automatic route planning.")
      return
    }

    setGeocodingStatus({})
    setLegDurations([])
    const newStops: Stop[] = []

    // Step 1: Geocode company address first (if available)
    // Use passed address (from fresh settings fetch) to avoid stale state
    const companyAddr = passedCompanyAddress || companyInfo.address
    let companyCoords: { lat: number; lng: number } | null = null
    if (companyAddr) {
      setGeocodingStatus(prev => ({ ...prev, company: 'pending' }))
      companyCoords = await geocodeAddress(companyAddr, passedToken)
      if (companyCoords) {
        const coords = companyCoords // capture narrowed non-null value for use inside state updater callbacks
        const companyStopForSave = {
          job: { client_id: '' } as any,
          lat: coords.lat,
          lng: coords.lng,
          address: companyAddr,
        }

        setCompanyInfo(prev => ({
          ...prev,
          address: companyAddr,
          lat: coords.lat,
          lng: coords.lng
        }))
        setGeocodingStatus(prev => ({ ...prev, company: 'success' }))

        // Auto-save company coordinates when successfully geocoded
        autoSaveCoordinates(companyStopForSave)
      } else {
        setGeocodingStatus(prev => ({ ...prev, company: 'error' }))
        console.warn("Could not geocode company address:", companyAddr)
      }
    }

    // Step 2: Geocode all job addresses automatically
    for (const job of currentJobs) {
      const address = job.clients?.address?.trim()
      if (!address) continue

      const jobKey = job.id
      setGeocodingStatus(prev => ({ ...prev, [jobKey]: 'pending' }))

      // Check if client already has coordinates stored
      const client = job.clients
      if (client?.latitude != null && client?.longitude != null) {
        newStops.push({
          job,
          lat: client.latitude,
          lng: client.longitude,
          address,
        })
        setGeocodingStatus(prev => ({ ...prev, [jobKey]: 'success' }))
        setStops([...newStops])
        continue
      }

      const coords = await geocodeAddress(address, passedToken)

      if (coords) {
        const newStop = {
          job,
          lat: coords.lat,
          lng: coords.lng,
          address,
        }
        newStops.push(newStop)
        setGeocodingStatus(prev => ({ ...prev, [jobKey]: 'success' }))

        // Auto-save coordinates when successfully geocoded
        autoSaveCoordinates(newStop)
      } else {
        setGeocodingStatus(prev => ({ ...prev, [jobKey]: 'error' }))
        console.warn("Failed to geocode:", address)
      }

      // Update UI live
      setStops([...newStops])

      // Small delay to be nice to Mapbox
      await new Promise(r => setTimeout(r, 600))
    }

    // Step 3: Automatically optimize if we have enough stops
    if (newStops.length >= 1) {
      // Small delay so the user sees the last geocoded result
      await new Promise(r => setTimeout(r, 300))
      performAutoOptimization(newStops, companyCoords, companyAddr)
    } else if (newStops.length === 0) {
      setError("Could not geocode any job addresses. You can still enter coordinates manually.")
    }
  }

  // Internal optimization that can be called automatically
  const performAutoOptimization = (
    jobStops: Stop[], 
    companyCoordsParam: { lat: number; lng: number } | null = null,
    companyAddressParam: string = ''
  ) => {
    if (jobStops.length < 1) return

    const companyCoords = companyCoordsParam || (companyInfo.lat != null && companyInfo.lng != null 
      ? { lat: companyInfo.lat, lng: companyInfo.lng } 
      : null)

    const companyAddr = companyAddressParam || companyInfo.address

    let finalStops: Stop[] = [...jobStops]
    let companyStop: Stop | null = null

    if (companyCoords) {
      companyStop = {
        job: { 
          id: 'company', 
          client_id: '', 
          title: 'Company (Start/End)', 
          scheduled_date: '', 
          status: '',
          clients: { id: '', name: 'Company', address: companyAddr, latitude: companyCoords.lat, longitude: companyCoords.lng }
        } as any,
        lat: companyCoords.lat,
        lng: companyCoords.lng,
        address: companyAddr || 'Company Address'
      }
    }

    // Optimize ONLY the actual job stops (correct depot routing)
    let order = nearestNeighbor(jobStops)
    order = twoOpt(jobStops, order)

    // Build the final route: Company → Optimized Jobs → Company
    if (companyStop) {
      finalStops = [companyStop, ...order.map(i => jobStops[i]), companyStop]
    } else {
      finalStops = order.map(i => jobStops[i])
    }

    // Create the order array for the final list (0 = first company, last = return company)
    const finalOrder = finalStops.map((_, idx) => idx)

    setOptimizedOrder(finalOrder)
    setStops(finalStops)

    fetchOsrmRoute(finalStops, finalOrder)
  }

  // Mapbox-only geocoding (Nominatim support has been removed)
  async function geocodeAddress(address: string, overrideToken?: string): Promise<{ lat: number; lng: number } | null> {
    if (!address) return null

    const token = overrideToken || geocodingConfig.mapboxToken

    if (!token) {
      console.warn("No Mapbox access token configured in Settings.")
      return null
    }

    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1&country=US`

      const res = await fetch(url)
      if (!res.ok) {
        console.warn('Mapbox geocoding failed with status', res.status)
        return null
      }

      const data = await res.json()
      const feature = data.features?.[0]

      if (feature?.center) {
        // Mapbox returns [lng, lat]
        return {
          lng: feature.center[0],
          lat: feature.center[1]
        }
      }

      return null
    } catch (err) {
      console.error('Mapbox geocoding error', err)
      return null
    }
  }

  // Simple nearest-neighbor + 2-opt optimization
  const applyManualCoordinates = () => {
    const manualStops: Stop[] = []

    failedToGeocode.forEach(job => {
      const coords = manualCoords[job.id]
      if (coords && coords.lat && coords.lng) {
        manualStops.push({
          job,
          lat: parseFloat(coords.lat),
          lng: parseFloat(coords.lng),
          address: job.clients?.address || 'Manual entry'
        })
      }
    })

    if (manualStops.length > 0) {
      const combined = [...stops, ...manualStops]
      setStops(combined)
      setFailedToGeocode([]) // clear the failed list
      setOptimizedOrder(combined.map((_, i) => i))
      setError(null)
    }
  }

  // Silent auto-save (no success alert, only error on failure)
  const autoSaveCoordinates = async (stop: Stop) => {
    const clientId = stop.job.client_id || stop.job.clients?.id
    if (!clientId) return

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          latitude: stop.lat,
          longitude: stop.lng,
        })
        .eq('id', clientId)

      if (error) {
        console.error("Failed to auto-save coordinates:", error)
      }
    } catch (err) {
      console.error("Failed to auto-save coordinates:", err)
    }
  }

  // Manual save (kept for the manual coordinates section if needed)
  const saveCoordinatesToClient = async (stop: Stop) => {
    const clientId = stop.job.client_id || stop.job.clients?.id
    if (!clientId) {
      setConfirmDialog({
        open: true,
        title: "Error",
        description: "Cannot save — client id not available",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
      return
    }

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          latitude: stop.lat,
          longitude: stop.lng,
        })
        .eq('id', clientId)

      if (error) throw error

      setConfirmDialog({
        open: true,
        title: "Saved",
        description: `Coordinates saved for ${stop.job.title || 'job'}`,
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
    } catch (err: any) {
      setConfirmDialog({
        open: true,
        title: "Save Failed",
        description: "Failed to save coordinates: " + (err.message || err),
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
    }
  }

  const optimizeRoute = () => {
    // Separate job stops from any existing company entries
    const jobStops = stops.filter(s => s.job.id !== 'company')

    let finalStops: Stop[] = [...jobStops]
    let companyStop: Stop | null = null

    if (companyInfo.lat != null && companyInfo.lng != null) {
      companyStop = {
        job: { 
          id: 'company', 
          client_id: '', 
          title: 'Company (Start/End)', 
          scheduled_date: '', 
          status: '',
          clients: { id: '', name: 'Company', address: companyInfo.address, latitude: companyInfo.lat, longitude: companyInfo.lng }
        } as any,
        lat: companyInfo.lat,
        lng: companyInfo.lng,
        address: companyInfo.address || 'Company Address'
      }
    }

    // Optimize only the actual job stops
    let order = nearestNeighbor(jobStops)
    order = twoOpt(jobStops, order)

    // Build final route: Company → Jobs → Company
    if (companyStop) {
      finalStops = [companyStop, ...order.map(i => jobStops[i]), companyStop]
    } else {
      finalStops = order.map(i => jobStops[i])
    }

    const finalOrder = finalStops.map((_, idx) => idx)

    setOptimizedOrder(finalOrder)
    setStops(finalStops)

    fetchOsrmRoute(finalStops, finalOrder)
  }

  function nearestNeighbor(stops: Stop[]): number[] {
    const n = stops.length
    const visited = new Set<number>()
    const order: number[] = [0]
    visited.add(0)

    let current = 0
    while (visited.size < n) {
      let nearest = -1
      let minDist = Infinity

      for (let i = 0; i < n; i++) {
        if (visited.has(i)) continue
        const d = haversine(stops[current], stops[i])
        if (d < minDist) {
          minDist = d
          nearest = i
        }
      }
      if (nearest !== -1) {
        order.push(nearest)
        visited.add(nearest)
        current = nearest
      }
    }
    return order
  }

  function twoOpt(stops: Stop[], order: number[]): number[] {
    let improved = true
    let best = [...order]

    while (improved) {
      improved = false
      for (let i = 1; i < best.length - 2; i++) {
        for (let j = i + 1; j < best.length - 1; j++) {
          const newOrder = twoOptSwap(best, i, j)
          if (routeDistance(stops, newOrder) < routeDistance(stops, best)) {
            best = newOrder
            improved = true
          }
        }
      }
    }
    return best
  }

  function twoOptSwap(order: number[], i: number, j: number): number[] {
    const newOrder = [...order]
    const segment = newOrder.slice(i, j + 1).reverse()
    return [...newOrder.slice(0, i), ...segment, ...newOrder.slice(j + 1)]
  }

  function routeDistance(stops: Stop[], order: number[]): number {
    let dist = 0
    for (let i = 0; i < order.length - 1; i++) {
      dist += haversine(stops[order[i]], stops[order[i + 1]])
    }
    return dist
  }

  function haversine(a: Stop, b: Stop): number {
    const R = 6371
    const dLat = ((b.lat - a.lat) * Math.PI) / 180
    const dLon = ((b.lng - a.lng) * Math.PI) / 180
    const lat1 = (a.lat * Math.PI) / 180
    const lat2 = (b.lat * Math.PI) / 180
    const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2)
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  }

  async function fetchOsrmRoute(stops: Stop[], order: number[]) {
    if (order.length < 2) return

    const coords = order.map(i => `${stops[i].lng},${stops[i].lat}`).join(';')
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`

    try {
      const res = await fetch(url)
      const data = await res.json()
      if (data.routes && data.routes[0]) {
        const route = data.routes[0]
        setRouteGeometry(route.geometry)
        setTotalDistance(Math.round(route.distance / 1000))
        setTotalTime(Math.round(route.duration / 60))

        if (route.legs && Array.isArray(route.legs)) {
          const durationsInMinutes = route.legs.map((leg: any) => Math.round(leg.duration / 60))
          setLegDurations(durationsInMinutes)
        } else {
          setLegDurations([])
        }
      }
    } catch (e) {
      console.error('OSRM routing failed', e)
      setLegDurations([])
      // Fallback: still show optimized order without polyline
    }
  }

  const orderedStops = optimizedOrder.length > 0 
    ? optimizedOrder.map(i => stops[i]) 
    : stops

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Route Planner</h1>
        <p className="text-muted-foreground mt-1">
          Optimize driving routes for jobs scheduled today that have addresses on file.
        </p>

        {configLoaded && !geocodingConfig.mapboxToken && (
          <div className="mt-3 border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
            <strong>Mapbox access token is not configured.</strong> Route planning will not work until you add a valid Mapbox token in <Link href="/dashboard/settings" className="underline">Settings → Productivity Tools</Link>.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Controls & List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="border p-4">
            <div className="text-sm font-medium mb-2">Today's Stops with Addresses</div>
            <div className="text-3xl font-semibold">{jobs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Jobs scheduled today that have a client address</p>

            <div className="mt-2 text-xs text-muted-foreground">
              Geocoding and route optimization happen automatically.
            </div>
          </div>

          {error && (
            <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Geocoding now happens automatically in the background */}

          {/* Manual coordinate entry for failed geocodes */}
          {failedToGeocode.length > 0 && (
            <div className="border p-4 space-y-3">
              <div className="text-sm font-medium">Manual Coordinates (for addresses that failed to geocode)</div>
              
              {failedToGeocode.map(job => (
                <div key={job.id} className="border p-3 space-y-2 text-sm">
                  <div className="font-medium">{job.title}</div>
                  <div className="text-xs text-muted-foreground">{job.clients?.address}</div>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Latitude"
                      className="border p-1 text-xs flex-1"
                      value={manualCoords[job.id]?.lat || ''}
                      onChange={(e) => setManualCoords(prev => ({
                        ...prev,
                        [job.id]: { ...prev[job.id], lat: e.target.value }
                      }))}
                    />
                    <input
                      type="text"
                      placeholder="Longitude"
                      className="border p-1 text-xs flex-1"
                      value={manualCoords[job.id]?.lng || ''}
                      onChange={(e) => setManualCoords(prev => ({
                        ...prev,
                        [job.id]: { ...prev[job.id], lng: e.target.value }
                      }))}
                    />
                  </div>
                </div>
              ))}

              <Button 
                onClick={applyManualCoordinates} 
                size="sm" 
                variant="outline"
                disabled={Object.keys(manualCoords).length === 0}
              >
                Apply Manual Coordinates
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Tip: Open the address in Google Maps → right-click the pin → copy latitude,longitude
              </p>
            </div>
          )}

          {orderedStops.length > 0 && (
            <div className="border p-4">
              <div className="text-sm font-medium mb-3">Optimized Stop Order</div>
              <ol className="space-y-2 text-sm">
                {orderedStops.map((stop, index) => {
                  const legTime = index > 0 && legDurations[index - 1] != null 
                    ? legDurations[index - 1] 
                    : null

                  return (
                    <li key={index} className="flex gap-3 border p-2 items-center">
                      <div className="font-mono text-xs w-5 text-muted-foreground">{index + 1}.</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{stop.job.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{stop.address}</div>
                        {legTime !== null && (
                          <div className="text-[10px] text-blue-600 mt-0.5">
                            ~{legTime} min from previous stop
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>

              {totalDistance !== null && (
                <div className="mt-4 text-xs text-muted-foreground">
                  ≈ {totalDistance} km • {totalTime} min driving time (via OSRM)
                </div>
              )}
            </div>
          )}

          <div className="text-[10px] text-muted-foreground">
            Geocoding uses OpenStreetMap Nominatim (free). Route uses OSRM.
          </div>
        </div>

        {/* Map */}
        <div className="lg:col-span-8 border">
          <div className="h-[620px] w-full">
            {stops.length > 0 ? (
              <RouteMap 
                stops={orderedStops} 
                geometry={routeGeometry}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Load stops to see the map
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title || ""}
        description={confirmDialog.description || ""}
        confirmLabel={confirmDialog.confirmLabel || "OK"}
        onConfirm={confirmDialog.onConfirm || (() => setConfirmDialog({ open: false }))}
      />
    </div>
  )
}
