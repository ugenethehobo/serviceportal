'use server'

import { revalidatePath } from 'next/cache'
import {
  formatAddressForDisplay,
  getDisplayAddressFromClient,
  hasCompleteStructuredAddress,
  structuredAddressFromCompanyRow,
} from '@/lib/address'
import { normalizeBookingSettings } from '@/lib/booking'
import {
  buildClientGeocodeAddressKey,
  buildCompanyGeocodeAddressKey,
  resolveGeocodeResults,
  type GeocodeResolveEntry,
} from '@/lib/address-geocoding'
import { persistResolvedGeocodes } from '@/lib/address-geocoding-server'
import {
  buildOptimizedSchedule,
  canOptimizeCrewDay,
  getMovableOptimizeStops,
  nearestNeighborOrder,
  orderIdsByIndices,
  type RouteOptimizeStop,
} from '@/lib/route-optimize'
import { getTripOptimizedJobOrder } from '@/lib/road-routing'
import {
  createSupabaseAdmin,
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'
import { getCompanyDayBounds } from '@/lib/timezone'

export type OptimizeCrewDayRouteResult =
  | {
      success: true
      updatedCount: number
      usedRoadOptimization: boolean
    }
  | { success: false; error: string }

async function getTravelBufferMinutes(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  companyId: string
) {
  const { data } = await supabaseAdmin
    .from('companies')
    .select('booking_settings')
    .eq('id', companyId)
    .maybeSingle()

  return normalizeBookingSettings(data?.booking_settings).travel_buffer_minutes
}

/**
 * Optimize visit order for one crew on one company-local day, then repack
 * scheduled job times (duration + travel buffer preserved).
 * Available on My Day without the Routes entitlement gate.
 */
export async function optimizeCrewDayRouteAction(input: {
  crewId: string
  dayOffset?: number
}): Promise<OptimizeCrewDayRouteResult> {
  try {
    const session = await getSessionProfile()
    if (!session) {
      return { success: false, error: 'Not authenticated' }
    }
    if (!session.profile.company_id) {
      return { success: false, error: 'No company associated with this account' }
    }
    if (!isStaffRole(session.profile.role)) {
      return { success: false, error: 'Unauthorized' }
    }

    const companyId = session.profile.company_id
    const subscription = await verifyStaffSubscriptionAccess(companyId)
    if (!subscription.ok) {
      return { success: false, error: TRIAL_EXPIRED_ERROR }
    }

    const crewId = input.crewId?.trim()
    if (!crewId) {
      return { success: false, error: 'Crew is required' }
    }

    const dayOffset = Number.isFinite(input.dayOffset) ? Math.trunc(input.dayOffset!) : 0
    if (dayOffset < -14 || dayOffset > 30) {
      return { success: false, error: 'Invalid day' }
    }

    const supabaseAdmin = createSupabaseAdmin()

    // Team members may only optimize their own crew
    if (session.profile.role === 'team_member') {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('crew_id')
        .eq('id', session.userId)
        .maybeSingle()

      if (!profile?.crew_id || profile.crew_id !== crewId) {
        return { success: false, error: "You can only optimize your crew's route" }
      }
    }

    const { data: crew, error: crewError } = await supabaseAdmin
      .from('crews')
      .select('id, name, company_id')
      .eq('id', crewId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (crewError || !crew) {
      return { success: false, error: 'Crew not found' }
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select(`
        timezone,
        address,
        address_street,
        address_unit,
        address_city,
        address_state,
        address_zip,
        latitude,
        longitude,
        geocode_address_key
      `)
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return { success: false, error: 'Company not found' }
    }

    const timezone = company.timezone || 'America/Chicago'
    const { startIso, endIso } = getCompanyDayBounds(timezone, new Date(), dayOffset)
    const travelBufferMinutes = await getTravelBufferMinutes(supabaseAdmin, companyId)

    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('company_id', companyId)

    const clientIds = (clients || []).map((c) => c.id)
    if (clientIds.length === 0) {
      return { success: false, error: 'No scheduled jobs to optimize' }
    }

    const { data: schedules, error: scheduleError } = await supabaseAdmin
      .from('schedules')
      .select(
        `
        id,
        title,
        start_time,
        end_time,
        status,
        client_id,
        crew_id,
        client:clients!client_id (
          id,
          name,
          address,
          address_street,
          address_unit,
          address_city,
          address_state,
          address_zip,
          latitude,
          longitude,
          geocode_address_key
        )
      `
      )
      .eq('crew_id', crewId)
      .in('client_id', clientIds)
      .neq('status', 'cancelled')
      .lt('start_time', endIso)
      .gt('end_time', startIso)
      .order('start_time', { ascending: true })

    if (scheduleError) {
      return { success: false, error: scheduleError.message }
    }

    if (!schedules?.length) {
      return { success: false, error: 'No jobs on this day to optimize' }
    }

    // Resolve geocodes for company + clients
    const geocodeEntries: GeocodeResolveEntry[] = []
    const structuredCompany = structuredAddressFromCompanyRow(company)
    const companyDisplayAddress = hasCompleteStructuredAddress(structuredCompany)
      ? formatAddressForDisplay(structuredCompany)
      : company.address?.trim() || ''
    const companyAddressKey = buildCompanyGeocodeAddressKey({
      address: company.address,
      address_street: company.address_street,
      address_unit: company.address_unit,
      address_city: company.address_city,
      address_state: company.address_state,
      address_zip: company.address_zip,
    })

    if (companyDisplayAddress && companyAddressKey) {
      geocodeEntries.push({
        id: 'company',
        address: companyDisplayAddress,
        addressKey: companyAddressKey,
        stored: company,
        persistTarget: 'company',
      })
    }

    for (const schedule of schedules) {
      const clientRaw = schedule.client
      const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw
      if (!client?.id) continue
      const address = getDisplayAddressFromClient(client)
      const addressKey = buildClientGeocodeAddressKey(client)
      if (!address || !addressKey) continue
      geocodeEntries.push({
        id: client.id,
        address,
        addressKey,
        stored: client,
        persistTarget: 'client',
        persistId: client.id,
      })
    }

    const resolved = await resolveGeocodeResults(geocodeEntries)
    await persistResolvedGeocodes(supabaseAdmin, companyId, resolved)

    let companyLocation: { latitude: number; longitude: number } | null = null
    const companyResult = resolved.results.get('company')
    if (companyResult?.success) {
      companyLocation = {
        latitude: companyResult.latitude,
        longitude: companyResult.longitude,
      }
    } else if (
      company.latitude != null &&
      company.longitude != null &&
      Number.isFinite(Number(company.latitude)) &&
      Number.isFinite(Number(company.longitude))
    ) {
      companyLocation = {
        latitude: Number(company.latitude),
        longitude: Number(company.longitude),
      }
    }

    const optimizeStops: RouteOptimizeStop[] = []

    for (const schedule of schedules) {
      const clientRaw = schedule.client
      const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw
      if (!client?.id) continue

      let lat: number | null = null
      let lng: number | null = null
      const clientResult = resolved.results.get(client.id)
      if (clientResult?.success) {
        lat = clientResult.latitude
        lng = clientResult.longitude
      } else if (
        client.latitude != null &&
        client.longitude != null &&
        Number.isFinite(Number(client.latitude)) &&
        Number.isFinite(Number(client.longitude))
      ) {
        lat = Number(client.latitude)
        lng = Number(client.longitude)
      }

      if (lat == null || lng == null) continue

      optimizeStops.push({
        id: schedule.id,
        latitude: lat,
        longitude: lng,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        status: schedule.status,
      })
    }

    if (!canOptimizeCrewDay(optimizeStops)) {
      return {
        success: false,
        error:
          'Need at least two scheduled jobs with valid addresses to optimize this route',
      }
    }

    const movable = getMovableOptimizeStops(optimizeStops)
    const jobCoordinates: [number, number][] = movable.map((s) => [
      s.longitude,
      s.latitude,
    ])
    const startCoordinate: [number, number] | null = companyLocation
      ? [companyLocation.longitude, companyLocation.latitude]
      : null

    let usedRoadOptimization = false
    let orderedIds: string[]

    const tripOrder = await getTripOptimizedJobOrder({
      jobCoordinates,
      startCoordinate,
    })

    if (tripOrder) {
      orderedIds = orderIdsByIndices(
        movable.map((s) => s.id),
        tripOrder
      )
      usedRoadOptimization = true
    } else {
      orderedIds = nearestNeighborOrder(
        movable.map((s) => ({
          id: s.id,
          latitude: s.latitude,
          longitude: s.longitude,
        })),
        companyLocation
      )
    }

    const packed = buildOptimizedSchedule(
      optimizeStops,
      orderedIds,
      travelBufferMinutes
    )

    if (packed.length === 0) {
      return { success: false, error: 'Nothing to reschedule' }
    }

    // Skip no-op updates
    const originalById = new Map(movable.map((s) => [s.id, s]))
    const changes = packed.filter((slot) => {
      const original = originalById.get(slot.id)
      if (!original) return false
      return (
        original.startTime !== slot.startTime || original.endTime !== slot.endTime
      )
    })

    if (changes.length === 0) {
      // Order may already be optimal with same times — still a success
      return {
        success: true,
        updatedCount: 0,
        usedRoadOptimization,
      }
    }

    for (const slot of changes) {
      const { error: updateError } = await supabaseAdmin
        .from('schedules')
        .update({
          start_time: slot.startTime,
          end_time: slot.endTime,
        })
        .eq('id', slot.id)
        .eq('crew_id', crewId)
        .eq('status', 'scheduled')

      if (updateError) {
        return { success: false, error: updateError.message }
      }
    }

    revalidatePath('/dashboard/team')
    revalidatePath('/dashboard/routes')
    revalidatePath('/dashboard/crews')
    revalidatePath('/dashboard/schedule')

    return {
      success: true,
      updatedCount: changes.length,
      usedRoadOptimization,
    }
  } catch (error: unknown) {
    console.error('optimizeCrewDayRouteAction error:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to optimize route'
    return { success: false, error: message }
  }
}
