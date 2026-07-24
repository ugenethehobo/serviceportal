import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildGoogleCalendarIntegrationSecrets,
  normalizeGoogleCalendarIntegrationConfig,
  refreshGoogleCalendarAccessToken,
  type GoogleCalendarIntegrationSecrets,
  type GoogleCalendarListEntry,
} from '@/lib/google-calendar-oauth'
import { getDisplayAddressFromClient } from '@/lib/address'
import { formatForDatetimeLocal } from '@/lib/timezone'
import { getCrewTerminology } from '@/lib/crew-terminology'

const SERVICE_PORTAL_SCHEDULE_PROPERTY = 'service_portal_schedule_id'

export type GoogleCalendarJobSnapshot = {
  id: string
  company_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  status: string
  google_calendar_event_id: string | null
  timezone: string
  client_name: string | null
  client_address: string | null
  crew_name: string | null
  /** Optional company plural field-team label for description copy. */
  crew_label?: string | null
}

export function shouldExportScheduleToGoogleCalendar(status: string): boolean {
  return status === 'scheduled' || status === 'in_progress'
}

export function buildGoogleCalendarEventPayload(job: GoogleCalendarJobSnapshot) {
  const summaryParts = [job.title.trim()]
  if (job.client_name?.trim()) summaryParts.push(job.client_name.trim())

  const crewWord = getCrewTerminology(job.crew_label).singular
  const descriptionParts = [
    job.description?.trim() || null,
    job.crew_name ? `${crewWord}: ${job.crew_name}` : null,
    `Service Portal job: ${job.id}`,
  ].filter(Boolean)

  return {
    summary: summaryParts.join(' — '),
    description: descriptionParts.join('\n\n'),
    location: job.client_address?.trim() || undefined,
    start: {
      dateTime: formatForDatetimeLocal(job.start_time, job.timezone),
      timeZone: job.timezone,
    },
    end: {
      dateTime: formatForDatetimeLocal(job.end_time, job.timezone),
      timeZone: job.timezone,
    },
    extendedProperties: {
      private: {
        [SERVICE_PORTAL_SCHEDULE_PROPERTY]: job.id,
      },
    },
  }
}

async function persistGoogleCalendarConfig(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  config: GoogleCalendarIntegrationSecrets
) {
  await supabaseAdmin
    .from('company_integrations')
    .update({
      config,
      status: 'connected',
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('provider', 'google_calendar')
}

export async function getGoogleCalendarAccessToken(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  config: GoogleCalendarIntegrationSecrets
): Promise<GoogleCalendarIntegrationSecrets | null> {
  const expiresAt = new Date(config.access_token_expires_at).getTime()
  const refreshBufferMs = 60 * 1000

  if (Date.now() < expiresAt - refreshBufferMs) {
    return config
  }

  try {
    const tokens = await refreshGoogleCalendarAccessToken(config.refresh_token)
    const refreshed = buildGoogleCalendarIntegrationSecrets({
      tokens,
      existing: config,
    })
    await persistGoogleCalendarConfig(supabaseAdmin, companyId, refreshed)
    return refreshed
  } catch (error) {
    console.error('getGoogleCalendarAccessToken refresh error:', error)
    await supabaseAdmin
      .from('company_integrations')
      .update({
        status: 'error',
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('provider', 'google_calendar')
    return null
  }
}

async function googleCalendarApiRequest(
  accessToken: string,
  path: string,
  init?: RequestInit
) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  if (response.status === 204) {
    return null
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? (data as { error?: { message?: string } }).error?.message
        : null
    throw new Error(message || `Google Calendar API failed (${response.status})`)
  }

  return data
}

export async function listGoogleCalendarsForCompany(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<GoogleCalendarListEntry[]> {
  const { data: integration } = await supabaseAdmin
    .from('company_integrations')
    .select('status, config')
    .eq('company_id', companyId)
    .eq('provider', 'google_calendar')
    .maybeSingle()

  if (integration?.status !== 'connected') return []

  const config = normalizeGoogleCalendarIntegrationConfig(
    (integration.config || {}) as Record<string, unknown>
  )
  if (!config) return []

  const refreshed = await getGoogleCalendarAccessToken(supabaseAdmin, companyId, config)
  if (!refreshed) return []

  const data = (await googleCalendarApiRequest(
    refreshed.access_token,
    '/users/me/calendarList?minAccessRole=writer'
  )) as { items?: Array<{ id?: string; summary?: string; primary?: boolean }> } | null

  return (data?.items || [])
    .filter((item) => item.id && item.summary)
    .map((item) => ({
      id: item.id!,
      summary: item.summary!,
      primary: item.primary,
    }))
    .sort((a, b) => {
      if (a.primary) return -1
      if (b.primary) return 1
      return a.summary.localeCompare(b.summary)
    })
}

async function loadScheduleSnapshot(
  supabaseAdmin: SupabaseClient,
  scheduleId: string
): Promise<GoogleCalendarJobSnapshot | null> {
  const { data: schedule, error } = await supabaseAdmin
    .from('schedules')
    .select(`
      id,
      title,
      description,
      start_time,
      end_time,
      status,
      google_calendar_event_id,
      client:clients!client_id (
        name,
        address,
        address_street,
        address_unit,
        address_city,
        address_state,
        address_zip,
        company_id
      ),
      crew:crews!crew_id (name)
    `)
    .eq('id', scheduleId)
    .single()

  if (error || !schedule) return null

  const client = Array.isArray(schedule.client) ? schedule.client[0] : schedule.client
  const crew = Array.isArray(schedule.crew) ? schedule.crew[0] : schedule.crew
  if (!client?.company_id) return null

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('timezone, crew_label')
    .eq('id', client.company_id)
    .single()

  return {
    id: schedule.id,
    company_id: client.company_id,
    title: schedule.title,
    description: schedule.description,
    start_time: schedule.start_time,
    end_time: schedule.end_time,
    status: schedule.status,
    google_calendar_event_id: schedule.google_calendar_event_id,
    timezone: company?.timezone || 'America/Chicago',
    client_name: client.name,
    client_address: getDisplayAddressFromClient(client),
    crew_name: crew?.name ?? null,
    crew_label: (company as { crew_label?: string | null } | null)?.crew_label ?? null,
  }
}

async function deleteGoogleCalendarEvent(input: {
  accessToken: string
  calendarId: string
  eventId: string
}) {
  await googleCalendarApiRequest(
    input.accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    { method: 'DELETE' }
  )
}

async function upsertGoogleCalendarEvent(input: {
  accessToken: string
  calendarId: string
  eventId: string | null
  payload: ReturnType<typeof buildGoogleCalendarEventPayload>
}) {
  if (input.eventId) {
    try {
      return await googleCalendarApiRequest(
        input.accessToken,
        `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
        {
          method: 'PUT',
          body: JSON.stringify(input.payload),
        }
      )
    } catch {
      // Fall through to create if the remote event was removed manually.
    }
  }

  return googleCalendarApiRequest(
    input.accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify(input.payload),
    }
  )
}

export async function syncScheduleToGoogleCalendar(
  supabaseAdmin: SupabaseClient,
  scheduleId: string
) {
  const job = await loadScheduleSnapshot(supabaseAdmin, scheduleId)
  if (!job) return

  const { data: integration } = await supabaseAdmin
    .from('company_integrations')
    .select('status, config')
    .eq('company_id', job.company_id)
    .eq('provider', 'google_calendar')
    .maybeSingle()

  if (integration?.status !== 'connected') return

  const config = normalizeGoogleCalendarIntegrationConfig(
    (integration.config || {}) as Record<string, unknown>
  )
  if (!config?.sync_enabled || !config.calendar_id) return

  const refreshed = await getGoogleCalendarAccessToken(
    supabaseAdmin,
    job.company_id,
    config
  )
  if (!refreshed) return

  if (!shouldExportScheduleToGoogleCalendar(job.status)) {
    if (!job.google_calendar_event_id) return

    await deleteGoogleCalendarEvent({
      accessToken: refreshed.access_token,
      calendarId: refreshed.calendar_id!,
      eventId: job.google_calendar_event_id,
    })

    await supabaseAdmin
      .from('schedules')
      .update({ google_calendar_event_id: null })
      .eq('id', job.id)

    return
  }

  const payload = buildGoogleCalendarEventPayload(job)
  const result = (await upsertGoogleCalendarEvent({
    accessToken: refreshed.access_token,
    calendarId: refreshed.calendar_id!,
    eventId: job.google_calendar_event_id,
    payload,
  })) as { id?: string } | null

  const eventId = result?.id || job.google_calendar_event_id
  if (eventId && eventId !== job.google_calendar_event_id) {
    await supabaseAdmin
      .from('schedules')
      .update({ google_calendar_event_id: eventId })
      .eq('id', job.id)
  }
}

export async function removeScheduleFromGoogleCalendar(
  supabaseAdmin: SupabaseClient,
  scheduleId: string
) {
  const job = await loadScheduleSnapshot(supabaseAdmin, scheduleId)
  if (!job?.google_calendar_event_id) return

  const { data: integration } = await supabaseAdmin
    .from('company_integrations')
    .select('status, config')
    .eq('company_id', job.company_id)
    .eq('provider', 'google_calendar')
    .maybeSingle()

  if (integration?.status !== 'connected') return

  const config = normalizeGoogleCalendarIntegrationConfig(
    (integration.config || {}) as Record<string, unknown>
  )
  if (!config?.calendar_id) return

  const refreshed = await getGoogleCalendarAccessToken(
    supabaseAdmin,
    job.company_id,
    config
  )
  if (!refreshed) return

  await deleteGoogleCalendarEvent({
    accessToken: refreshed.access_token,
    calendarId: refreshed.calendar_id!,
    eventId: job.google_calendar_event_id,
  })
}

export async function queueGoogleCalendarSync(
  supabaseAdmin: SupabaseClient,
  scheduleId: string | null | undefined
) {
  if (!scheduleId) return

  try {
    await syncScheduleToGoogleCalendar(supabaseAdmin, scheduleId)
  } catch (error) {
    console.error('queueGoogleCalendarSync error:', error)
  }
}

export async function queueGoogleCalendarRemoval(
  supabaseAdmin: SupabaseClient,
  scheduleId: string | null | undefined
) {
  if (!scheduleId) return

  try {
    await removeScheduleFromGoogleCalendar(supabaseAdmin, scheduleId)
  } catch (error) {
    console.error('queueGoogleCalendarRemoval error:', error)
  }
}