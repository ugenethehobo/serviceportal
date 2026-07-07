'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import {
  getAvailableCrews,
} from '@/lib/scheduling'
import {
  normalizeBookingMode,
  normalizeBookingSettings,
  isValidBookingSlug,
  suggestBookingSlug,
  getPublicBookingUrl,
  type BookingMode,
  type BookingSettings,
  type BookableService,
} from '@/lib/booking'
import {
  buildBookingSlotsForDay,
  computeAvailableCrewIdsByStartMinutes,
  isBookableWeekday,
  isSlotStartAllowed,
  isSlotWithinBusinessHours,
  pickAutoAssignedCrewId,
} from '@/lib/booking-slots'
import { normalizeBusinessHours } from '@/lib/business-hours'
import {
  getCompanyDateString,
  getCompanyDayBounds,
  getMinutesFromMidnightInTimezone,
} from '@/lib/timezone'
import { buildIsoFromDayAndMinutes } from '@/lib/schedule-calendar'
import {
  buildStructuredAddressDbFields,
  normalizeStructuredAddress,
  validateStructuredAddressIfPresent,
  type StructuredAddress,
} from '@/lib/address'
import { insertLeadActivity } from '@/lib/leads-server'
import {
  getSessionProfile,
  isStaffRole,
  TRIAL_EXPIRED_ERROR,
  verifyStaffSubscriptionAccess,
} from '@/lib/portal-auth'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type PublicBookingPageData = {
  companyId: string
  companyName: string
  logoUrl: string | null
  bookingMode: BookingMode
  bookingSettings: BookingSettings
  timezone: string
  services: BookableService[]
  hasBookableCrews: boolean
}

async function getCompanyByBookingSlug(slug: string) {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select(`
      id,
      name,
      logo_url,
      timezone,
      business_hours_start,
      business_hours_end,
      booking_mode,
      booking_slug,
      booking_settings
    `)
    .eq('booking_slug', slug)
    .single()

  if (error || !data) return null
  return data
}

export async function getPublicBookingPageAction(
  slug: string
): Promise<
  | { success: true; data: PublicBookingPageData }
  | { success: false; error: string }
> {
  const company = await getCompanyByBookingSlug(slug.trim().toLowerCase())
  if (!company) {
    return { success: false, error: 'Booking page not found' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const [{ data: services }, { count: crewCount }] = await Promise.all([
    supabaseAdmin
      .from('bookable_services')
      .select('*')
      .eq('company_id', company.id)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('crews')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id),
  ])

  return {
    success: true,
    data: {
      companyId: company.id,
      companyName: company.name,
      logoUrl: company.logo_url,
      bookingMode: normalizeBookingMode(company.booking_mode),
      bookingSettings: normalizeBookingSettings(company.booking_settings),
      timezone: company.timezone || 'America/Chicago',
      services: (services || []) as BookableService[],
      hasBookableCrews: (crewCount || 0) > 0,
    },
  }
}

export async function createPublicBookingRequestAction(input: {
  slug: string
  name: string
  contactName?: string
  email?: string
  phone?: string
  notes?: string
  preferredTime?: string
  serviceIds?: string[]
  leadAddress?: StructuredAddress
}) {
  const company = await getCompanyByBookingSlug(input.slug.trim().toLowerCase())
  if (!company) return { success: false as const, error: 'Booking page not found' }
  if (normalizeBookingMode(company.booking_mode) !== 'request_form') {
    return { success: false as const, error: 'This company is not accepting booking requests' }
  }

  if (!input.name.trim()) {
    return { success: false as const, error: 'Name is required' }
  }

  if (!input.email?.trim() && !input.phone?.trim()) {
    return { success: false as const, error: 'Email or phone is required' }
  }

  const supabaseAdmin = createSupabaseAdmin()

  let addressFields: ReturnType<typeof buildStructuredAddressDbFields> | null = null
  if (input.leadAddress) {
    const normalized = normalizeStructuredAddress(input.leadAddress)
    const validation = validateStructuredAddressIfPresent(normalized)
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0]
      return { success: false as const, error: firstError || 'Address is invalid' }
    }
    addressFields = buildStructuredAddressDbFields(normalized)
  }

  const requestedServiceIds = [...new Set((input.serviceIds || []).filter(Boolean))]
  let selectedServices: BookableService[] = []

  if (requestedServiceIds.length > 0) {
    const { data: services } = await supabaseAdmin
      .from('bookable_services')
      .select('*')
      .eq('company_id', company.id)
      .eq('active', true)
      .in('id', requestedServiceIds)

    selectedServices = (services || []) as BookableService[]
    if (selectedServices.length !== requestedServiceIds.length) {
      return { success: false as const, error: 'One or more selected services are unavailable' }
    }
  }

  const { buildRequestedServicesNote, sumServicePackageEstimates } = await import(
    '@/lib/service-packages'
  )

  const noteParts = [
    buildRequestedServicesNote(selectedServices, input.notes?.trim() || undefined),
    input.preferredTime?.trim() ? `Preferred time: ${input.preferredTime.trim()}` : null,
  ].filter(Boolean)

  const estimatedValue = sumServicePackageEstimates(selectedServices)

  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .insert({
      company_id: company.id,
      name: input.name.trim(),
      contact_name: input.contactName?.trim() || input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address: addressFields?.address ?? null,
      address_street: addressFields?.address_street ?? null,
      address_unit: addressFields?.address_unit ?? null,
      address_city: addressFields?.address_city ?? null,
      address_state: addressFields?.address_state ?? null,
      address_zip: addressFields?.address_zip ?? null,
      source: 'website',
      status: 'new',
      priority: 'normal',
      notes: noteParts.length > 0 ? noteParts.join('\n\n') : null,
      estimated_value: estimatedValue,
    })
    .select('*')
    .single()

  if (error || !lead) {
    return { success: false as const, error: error?.message || 'Could not submit request' }
  }

  const activityBody =
    selectedServices.length > 0
      ? `Submitted via public request form for: ${selectedServices.map((service) => service.name).join(', ')}`
      : 'Submitted via public booking request form'

  await insertLeadActivity(supabaseAdmin, {
    leadId: lead.id,
    companyId: company.id,
    type: 'note',
    body: activityBody,
    createdBy: null,
  })

  const { queueCompanyZapierEvent } = await import('@/lib/integration-events')
  queueCompanyZapierEvent(supabaseAdmin, {
    companyId: company.id,
    event: 'lead_created',
    data: {
      lead_id: lead.id,
      name: lead.name,
      contact_name: lead.contact_name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      status: lead.status,
      estimated_value: lead.estimated_value,
    },
  })

  return { success: true as const, leadId: lead.id }
}

async function getCompanyScheduleConflicts(
  companyId: string,
  startIso: string,
  endIso: string
) {
  const supabaseAdmin = createSupabaseAdmin()
  const { data: clients } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('company_id', companyId)

  const clientIds = clients?.map((client) => client.id) || []
  if (clientIds.length === 0) return []

  const { data } = await supabaseAdmin
    .from('schedules')
    .select('id, crew_id, start_time, end_time')
    .in('client_id', clientIds)
    .neq('status', 'cancelled')
    .neq('status', 'archived')
    .lte('start_time', endIso)
    .gte('end_time', startIso)

  return data || []
}

export async function getPublicBookingSlotsAction(input: {
  slug: string
  serviceId: string
  dateStr: string
}) {
  const company = await getCompanyByBookingSlug(input.slug.trim().toLowerCase())
  if (!company) return { success: false as const, error: 'Booking page not found' }
  if (normalizeBookingMode(company.booking_mode) !== 'online_booking') {
    return { success: false as const, error: 'Online booking is not enabled' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: service, error: serviceError } = await supabaseAdmin
    .from('bookable_services')
    .select('*')
    .eq('id', input.serviceId)
    .eq('company_id', company.id)
    .eq('active', true)
    .single()

  if (serviceError || !service) {
    return { success: false as const, error: 'Service not found' }
  }

  const timezone = company.timezone || 'America/Chicago'
  const businessHours = normalizeBusinessHours(
    company.business_hours_start,
    company.business_hours_end
  )
  const bookingSettings = normalizeBookingSettings(company.booking_settings)
  const todayStr = getCompanyDateString(timezone)
  if (input.dateStr < todayStr) {
    return { success: true as const, slots: [] }
  }
  if (!isBookableWeekday(input.dateStr, timezone, bookingSettings.bookable_weekdays)) {
    return { success: true as const, slots: [] }
  }

  const { data: crews } = await supabaseAdmin
    .from('crews')
    .select('id, name')
    .eq('company_id', company.id)
    .order('name', { ascending: true })

  if (!crews || crews.length === 0) {
    return { success: false as const, error: 'No crews are configured for booking' }
  }

  const dayBounds = getCompanyDayBounds(
    timezone,
    new Date(buildIsoFromDayAndMinutes(input.dateStr, 12 * 60, timezone)),
    0
  )

  const conflicts = await getCompanyScheduleConflicts(
    company.id,
    dayBounds.startIso,
    dayBounds.endIso
  )

  const availableCrewIdsByStartMinutes = computeAvailableCrewIdsByStartMinutes({
    dateStr: input.dateStr,
    timezone,
    businessHours,
    durationMinutes: service.duration_minutes,
    slotSettings: bookingSettings,
    crewIds: crews.map((crew) => crew.id),
    conflicts,
  })

  const slots = buildBookingSlotsForDay({
    dateStr: input.dateStr,
    timezone,
    businessHours,
    durationMinutes: service.duration_minutes,
    availableCrewIdsByStartMinutes,
    slotIntervalMinutes: bookingSettings.slot_interval_minutes,
  })

  return { success: true as const, slots }
}

async function findOrCreateBookingClient(input: {
  companyId: string
  name: string
  email?: string
  phone?: string
  leadAddress?: StructuredAddress
}) {
  const supabaseAdmin = createSupabaseAdmin()
  const email = input.email?.trim().toLowerCase()

  if (email) {
    const { data: existing } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('company_id', input.companyId)
      .ilike('email', email)
      .neq('status', 'archived')
      .maybeSingle()

    if (existing) return existing.id
  }

  let addressFields: ReturnType<typeof buildStructuredAddressDbFields> | null = null
  if (input.leadAddress) {
    const normalized = normalizeStructuredAddress(input.leadAddress)
    const validation = validateStructuredAddressIfPresent(normalized)
    if (!validation.valid) {
      throw new Error(Object.values(validation.errors)[0] || 'Address is invalid')
    }
    addressFields = buildStructuredAddressDbFields(normalized)
  }

  const { data: created, error } = await supabaseAdmin
    .from('clients')
    .insert({
      company_id: input.companyId,
      name: input.name.trim(),
      contact_name: input.name.trim(),
      email: email || null,
      phone: input.phone?.trim() || null,
      address: addressFields?.address ?? null,
      address_street: addressFields?.address_street ?? null,
      address_unit: addressFields?.address_unit ?? null,
      address_city: addressFields?.address_city ?? null,
      address_state: addressFields?.address_state ?? null,
      address_zip: addressFields?.address_zip ?? null,
      status: 'active',
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(error?.message || 'Could not create client')
  }

  return created.id
}

export async function confirmPublicOnlineBookingAction(input: {
  slug: string
  serviceId: string
  startIso: string
  name: string
  email: string
  phone?: string
  notes?: string
  leadAddress?: StructuredAddress
}) {
  const company = await getCompanyByBookingSlug(input.slug.trim().toLowerCase())
  if (!company) return { success: false as const, error: 'Booking page not found' }
  if (normalizeBookingMode(company.booking_mode) !== 'online_booking') {
    return { success: false as const, error: 'Online booking is not enabled' }
  }

  if (!input.name.trim()) return { success: false as const, error: 'Name is required' }
  if (!input.email.trim()) return { success: false as const, error: 'Email is required' }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: service, error: serviceError } = await supabaseAdmin
    .from('bookable_services')
    .select('*')
    .eq('id', input.serviceId)
    .eq('company_id', company.id)
    .eq('active', true)
    .single()

  if (serviceError || !service) {
    return { success: false as const, error: 'Service not found' }
  }

  const bookingSettings = normalizeBookingSettings(company.booking_settings)
  const timezone = company.timezone || 'America/Chicago'
  const businessHours = normalizeBusinessHours(
    company.business_hours_start,
    company.business_hours_end
  )

  const start = new Date(input.startIso)
  if (Number.isNaN(start.getTime())) {
    return { success: false as const, error: 'Selected time is no longer available' }
  }
  if (!isSlotStartAllowed(input.startIso, bookingSettings.min_notice_hours)) {
    return { success: false as const, error: 'Selected time is no longer available' }
  }

  const dateStr = getCompanyDateString(timezone, start)
  if (!isBookableWeekday(dateStr, timezone, bookingSettings.bookable_weekdays)) {
    return { success: false as const, error: 'That day is not available for booking' }
  }

  const startMinutes = getMinutesFromMidnightInTimezone(input.startIso, timezone)
  if (!isSlotWithinBusinessHours(startMinutes, service.duration_minutes, businessHours)) {
    return { success: false as const, error: 'Selected time is outside business hours' }
  }

  const endIso = new Date(
    start.getTime() + service.duration_minutes * 60 * 1000
  ).toISOString()

  const availableCrews = await getAvailableCrews(company.id, input.startIso, endIso, {
    bufferMinutes: bookingSettings.travel_buffer_minutes,
  })
  const crewId = pickAutoAssignedCrewId(availableCrews.map((crew) => crew.id))
  if (!crewId) {
    return { success: false as const, error: 'That time slot is no longer available' }
  }

  try {
    const clientId = await findOrCreateBookingClient({
      companyId: company.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      leadAddress: input.leadAddress,
    })

    const { data: schedule, error: scheduleError } = await supabaseAdmin
      .from('schedules')
      .insert({
        client_id: clientId,
        crew_id: crewId,
        title: service.name,
        description: input.notes?.trim() || service.description || null,
        start_time: input.startIso,
        end_time: endIso,
        status: 'scheduled',
        price: service.price_estimate || 0,
      })
      .select('id, title, start_time, end_time, crew_id')
      .single()

    if (scheduleError || !schedule) {
      return { success: false as const, error: scheduleError?.message || 'Could not book visit' }
    }

    if ((service.price_estimate || 0) > 0) {
      const { seedBillingFromJobPrice } = await import('@/lib/billing-server')
      await seedBillingFromJobPrice(
        supabaseAdmin,
        schedule.id,
        clientId,
        company.id,
        service.name,
        service.price_estimate || 0
      )
    }

    const { queueCompanyZapierEvent } = await import('@/lib/integration-events')
    const crew = availableCrews.find((item) => item.id === crewId)
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('name, email, phone')
      .eq('id', clientId)
      .single()

    queueCompanyZapierEvent(supabaseAdmin, {
      companyId: company.id,
      event: 'job_scheduled',
      data: {
        schedule_id: schedule.id,
        client_id: clientId,
        job_title: schedule.title,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        crew_id: crewId,
        crew_name: crew?.name ?? null,
        client_name: client?.name ?? null,
        source: 'online_booking',
      },
    })

    const {
      notifyClientBookingConfirmed,
      notifyStaffOnlineBookingReceived,
      queueNotification,
    } = await import('@/lib/notifications-server')
    await queueNotification(supabaseAdmin, async (admin) => {
      await notifyClientBookingConfirmed(admin, {
        companyId: company.id,
        companyName: company.name,
        clientId,
        clientEmail: client?.email,
        clientPhone: client?.phone,
        clientName: client?.name,
        jobTitle: schedule.title,
        startTime: schedule.start_time,
        scheduleId: schedule.id,
      })
      await notifyStaffOnlineBookingReceived(admin, {
        companyId: company.id,
        companyName: company.name,
        clientId,
        clientName: client?.name ?? input.name.trim(),
        clientEmail: client?.email ?? input.email.trim(),
        clientPhone: client?.phone ?? (input.phone?.trim() || null),
        jobTitle: schedule.title,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        scheduleId: schedule.id,
        crewName: crew?.name ?? null,
        serviceName: service.name,
      })
    })

    revalidatePath('/dashboard/clients')
    revalidatePath(`/dashboard/clients/${clientId}`)
    revalidatePath(`/dashboard/clients/${clientId}/jobs/${schedule.id}`)
    revalidatePath('/dashboard/schedule')

    const { queueGoogleCalendarSync } = await import('@/lib/google-calendar-sync')
    await queueGoogleCalendarSync(supabaseAdmin, schedule.id)

    return {
      success: true as const,
      scheduleId: schedule.id,
      startTime: schedule.start_time,
      serviceName: service.name,
    }
  } catch (error: any) {
    return { success: false as const, error: error.message || 'Could not complete booking' }
  }
}

async function verifyCompanyStaffForBooking() {
  const session = await getSessionProfile()
  if (!session) {
    return { ok: false as const, error: 'Not authenticated' }
  }
  if (!session.profile.company_id) {
    return { ok: false as const, error: 'No company associated with this account' }
  }
  if (!isStaffRole(session.profile.role)) {
    return { ok: false as const, error: 'Unauthorized' }
  }

  const subscription = await verifyStaffSubscriptionAccess(session.profile.company_id)
  if (!subscription.ok) {
    return { ok: false as const, error: TRIAL_EXPIRED_ERROR }
  }

  return {
    ok: true as const,
    companyId: session.profile.company_id,
    role: session.profile.role,
  }
}

export async function getBookingSettingsAction(): Promise<
  | {
      success: true
      bookingMode: BookingMode
      bookingSlug: string
      bookingUrl: string
      bookingSettings: BookingSettings
      activePackageCount: number
      suggestedSlug: string
    }
  | { success: false; error: string }
> {
  const check = await verifyCompanyStaffForBooking()
  if (!check.ok) return { success: false, error: check.error }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: company, error } = await supabaseAdmin
    .from('companies')
    .select('name, booking_mode, booking_slug, booking_settings')
    .eq('id', check.companyId)
    .single()

  if (error) {
    if (error.code === '42703') {
      return {
        success: false,
        error: 'Booking is not enabled yet. Run supabase/booking-schema.sql.',
      }
    }
    return { success: false, error: error.message }
  }

  const { countActiveServicePackages } = await import('@/app/service-package-actions')
  const activePackageCount = await countActiveServicePackages(check.companyId)

  const slug = company.booking_slug || suggestBookingSlug(company.name || 'company')

  return {
    success: true,
    bookingMode: normalizeBookingMode(company.booking_mode),
    bookingSlug: slug,
    bookingUrl: getPublicBookingUrl(slug),
    bookingSettings: normalizeBookingSettings(company.booking_settings),
    activePackageCount,
    suggestedSlug: suggestBookingSlug(company.name || 'company'),
  }
}

export async function updateBookingSettingsAction(input: {
  bookingMode: BookingMode
  bookingSlug: string
  bookingSettings: BookingSettings
}) {
  const check = await verifyCompanyStaffForBooking()
  if (!check.ok) return { success: false as const, error: check.error }
  if (check.role !== 'company_admin') {
    return { success: false as const, error: 'Only admins can update booking settings' }
  }

  const slug = input.bookingSlug.trim().toLowerCase()
  if (!isValidBookingSlug(slug)) {
    return {
      success: false as const,
      error: 'Booking link must be 3–48 characters using lowercase letters, numbers, and hyphens',
    }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: slugOwner } = await supabaseAdmin
    .from('companies')
    .select('id')
    .eq('booking_slug', slug)
    .neq('id', check.companyId)
    .maybeSingle()

  if (slugOwner) {
    return { success: false as const, error: 'That booking link is already in use' }
  }

  if (input.bookingMode === 'online_booking') {
    const { countActiveServicePackages } = await import('@/app/service-package-actions')
    const activeCount = await countActiveServicePackages(check.companyId)
    if (activeCount === 0) {
      return {
        success: false as const,
        error: 'Add at least one active service package before enabling online booking',
      }
    }
  }

  const { error: companyError } = await supabaseAdmin
    .from('companies')
    .update({
      booking_mode: input.bookingMode,
      booking_slug: slug,
      booking_settings: normalizeBookingSettings(input.bookingSettings),
    })
    .eq('id', check.companyId)

  if (companyError) {
    if (companyError.code === '42703') {
      return {
        success: false as const,
        error: 'Booking is not enabled yet. Run supabase/booking-schema.sql.',
      }
    }
    return { success: false as const, error: companyError.message }
  }

  revalidatePath('/dashboard/settings')

  return {
    success: true as const,
    bookingUrl: getPublicBookingUrl(slug),
  }
}