import {
  formatMinutesAsTime,
  getTimelineDurationMinutes,
  parseTimeToMinutes,
  type BusinessHours,
} from '@/lib/business-hours'
import {
  buildProjectedScheduleId,
  occurrenceTimesMatch,
  projectRecurringOccurrences,
  type RecurringRule,
} from '@/lib/recurring-schedule-projection'
import {
  getCompanyDateString,
  getCompanyDayBounds,
  getMinutesFromMidnightInTimezone,
  parseAsCompanyTime,
} from '@/lib/timezone'

export const SCHEDULE_CALENDAR_SNAP_MINUTES = 15
export const SCHEDULE_CALENDAR_PIXELS_PER_HOUR = 48

export const SCHEDULE_CREW_COLORS = [
  { bg: 'bg-blue-500', border: 'border-blue-600', ring: 'ring-blue-500/30' },
  { bg: 'bg-emerald-500', border: 'border-emerald-600', ring: 'ring-emerald-500/30' },
  { bg: 'bg-orange-500', border: 'border-orange-600', ring: 'ring-orange-500/30' },
  { bg: 'bg-violet-500', border: 'border-violet-600', ring: 'ring-violet-500/30' },
  { bg: 'bg-rose-500', border: 'border-rose-600', ring: 'ring-rose-500/30' },
  { bg: 'bg-cyan-500', border: 'border-cyan-600', ring: 'ring-cyan-500/30' },
] as const

export const UNASSIGNED_CREW_COLOR = {
  bg: 'bg-slate-400',
  border: 'border-slate-500',
  ring: 'ring-slate-400/30',
} as const

export type ScheduleCalendarDay = {
  dateStr: string
  label: string
  shortLabel: string
  isToday: boolean
  dayIndex: number
  startIso: string
  endIso: string
}

export type ScheduleCalendarCrew = {
  id: string
  name: string
  colorIndex: number
}

export type ScheduleCalendarJob = {
  id: string
  clientId: string
  title: string
  crewId: string | null
  crewName: string
  colorIndex: number
  clientName: string
  location: string
  status: string
  displayStatus: 'Scheduled' | 'In Progress' | 'Completed'
  isDraggable: boolean
  isProjected: boolean
  recurringRuleId: string | null
  anchorJobId: string | null
  occurrenceStart: string
  startTime: string
  endTime: string
  dayIndex: number
  startMinutes: number
  durationMinutes: number
}

export function isScheduleJobDraggable(status: string): boolean {
  return status === 'scheduled' || status === 'in_progress'
}

export function getScheduleJobDragBlockedReason(job: {
  status: string
  recurringRuleId: string | null
}): string | null {
  if (job.status === 'archived') {
    return job.recurringRuleId
      ? 'Past recurring visits are archived. Drag a future visit in the series instead.'
      : 'Archived jobs cannot be rescheduled.'
  }
  if (job.status === 'cancelled') {
    return 'Cancelled jobs cannot be rescheduled.'
  }
  if (!isScheduleJobDraggable(job.status)) {
    return 'This job cannot be rescheduled.'
  }
  return null
}

export type ScheduleCalendarData = {
  companyId: string
  timezone: string
  businessHours: BusinessHours
  weekOffset: number
  weekLabel: string
  days: ScheduleCalendarDay[]
  crews: ScheduleCalendarCrew[]
  jobs: ScheduleCalendarJob[]
  timelineHeightPx: number
  hourLabels: string[]
}

type RawSchedule = {
  id: string
  title: string
  start_time: string
  end_time: string
  status: string
  client_id: string
  crew_id: string | null
  recurring_rule_id?: string | null
  occurrence_origin_start?: string | null
  client: { name: string; address?: string | null } | { name: string; address?: string | null }[] | null
  crew: { id: string; name: string } | { id: string; name: string }[] | null
}

export type RecurringSeriesAnchor = {
  schedule: RawSchedule
  rule: RecurringRule
}

export function selectRecurringSeriesAnchors(
  anchors: RawSchedule[],
  rulesById: Map<string, RecurringRule>
): RecurringSeriesAnchor[] {
  const anchorsByRuleId = new Map<string, RawSchedule>()

  for (const schedule of anchors) {
    if (!schedule.recurring_rule_id) continue
    if (!['scheduled', 'in_progress'].includes(schedule.status)) continue

    const ruleId = schedule.recurring_rule_id
    const existing = anchorsByRuleId.get(ruleId)
    const isOverride = !!schedule.occurrence_origin_start
    const existingIsOverride = !!existing?.occurrence_origin_start

    if (!existing) {
      anchorsByRuleId.set(ruleId, schedule)
      continue
    }

    if (isOverride && !existingIsOverride) continue
    if (!isOverride && existingIsOverride) {
      anchorsByRuleId.set(ruleId, schedule)
      continue
    }

    if (new Date(schedule.start_time) < new Date(existing.start_time)) {
      anchorsByRuleId.set(ruleId, schedule)
    }
  }

  return Array.from(anchorsByRuleId.entries())
    .map(([ruleId, schedule]) => {
      const rule = rulesById.get(ruleId)
      if (!rule) return null
      return { schedule, rule }
    })
    .filter((series): series is RecurringSeriesAnchor => !!series)
}

type RawCrew = {
  id: string
  name: string
}

function unwrapRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export function getCompanyDayOfWeek(timezone: string, date: Date = new Date()): number {
  const dateStr = getCompanyDateString(timezone, date)
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(new Date(parseAsCompanyTime(`${dateStr}T12:00`, timezone)))

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  return map[weekday] ?? 0
}

export function getCompanyWeekDayBounds(
  timezone: string,
  date: Date = new Date(),
  weekOffset = 0
) {
  const dayOfWeek = getCompanyDayOfWeek(timezone, date)
  const weekStartOffset = -dayOfWeek + weekOffset * 7
  const todayStr = getCompanyDateString(timezone, date)

  const days = Array.from({ length: 7 }, (_, index) => {
    const bounds = getCompanyDayBounds(timezone, date, weekStartOffset + index)
    const anchor = new Date(parseAsCompanyTime(`${bounds.dateStr}T12:00`, timezone))
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(anchor)
    const shortLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'narrow',
    }).format(anchor)

    return {
      ...bounds,
      label,
      shortLabel,
      isToday: bounds.dateStr === todayStr,
      dayIndex: index,
    }
  })

  return {
    days,
    weekStartIso: days[0].startIso,
    weekEndIso: days[6].endIso,
    weekStartDateStr: days[0].dateStr,
    weekEndDateStr: days[6].dateStr,
  }
}

export function formatScheduleWeekLabel(
  timezone: string,
  weekStartDateStr: string,
  weekEndDateStr: string
): string {
  const start = new Date(parseAsCompanyTime(`${weekStartDateStr}T12:00`, timezone))
  const end = new Date(parseAsCompanyTime(`${weekEndDateStr}T12:00`, timezone))
  const sameMonth = start.getUTCMonth() === end.getUTCMonth()

  const startLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
  }).format(start)

  const endLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(end)

  return `${startLabel} – ${endLabel}`
}

export function buildCrewColorIndexMap(crews: RawCrew[]): Map<string, number> {
  const map = new Map<string, number>()
  crews.forEach((crew, index) => {
    map.set(crew.id, index % SCHEDULE_CREW_COLORS.length)
  })
  return map
}

function getDisplayStatus(
  status: string,
  startIso: string,
  endIso: string,
  now: Date
): ScheduleCalendarJob['displayStatus'] {
  const nowMs = now.getTime()
  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()

  if (status === 'archived' || nowMs >= endMs) return 'Completed'
  if (status === 'in_progress' || (status === 'scheduled' && nowMs >= startMs && nowMs < endMs)) {
    return 'In Progress'
  }
  return 'Scheduled'
}

export function scheduleIsInWeek(
  startIso: string,
  days: ScheduleCalendarDay[],
  timezone: string
): boolean {
  const dateStr = getCompanyDateString(timezone, new Date(startIso))
  return days.some((day) => day.dateStr === dateStr)
}

export function resolveScheduleDayIndex(
  startIso: string,
  days: ScheduleCalendarDay[],
  timezone: string
): number {
  const dateStr = getCompanyDateString(timezone, new Date(startIso))
  const index = days.findIndex((day) => day.dateStr === dateStr)
  return index
}

export function snapCalendarMinutes(minutes: number, snap = SCHEDULE_CALENDAR_SNAP_MINUTES): number {
  return Math.round(minutes / snap) * snap
}

export function clampCalendarStartMinutes(
  startMinutes: number,
  durationMinutes: number,
  businessHours: BusinessHours
): number {
  const open = parseTimeToMinutes(businessHours.start)
  const close = parseTimeToMinutes(businessHours.end)
  const maxStart = Math.max(open, close - durationMinutes)
  return Math.min(Math.max(startMinutes, open), maxStart)
}

export function buildIsoFromDayAndMinutes(
  dateStr: string,
  minutes: number,
  timezone: string
): string {
  return parseAsCompanyTime(`${dateStr}T${formatMinutesAsTime(minutes)}`, timezone)
}

export function minutesToCalendarTopPx(
  minutes: number,
  businessHours: BusinessHours,
  pixelsPerHour = SCHEDULE_CALENDAR_PIXELS_PER_HOUR
): number {
  const open = parseTimeToMinutes(businessHours.start)
  return ((minutes - open) / 60) * pixelsPerHour
}

export function calendarTopPxToMinutes(
  topPx: number,
  businessHours: BusinessHours,
  pixelsPerHour = SCHEDULE_CALENDAR_PIXELS_PER_HOUR
): number {
  const open = parseTimeToMinutes(businessHours.start)
  return open + (topPx / pixelsPerHour) * 60
}

export function getCalendarHourLabels(businessHours: BusinessHours): string[] {
  const start = parseTimeToMinutes(businessHours.start)
  const end = parseTimeToMinutes(businessHours.end)
  const labels: string[] = []

  for (let minute = start; minute < end; minute += 60) {
    const hour = Math.floor(minute / 60)
    const date = new Date()
    date.setHours(hour, 0, 0, 0)
    labels.push(date.toLocaleTimeString([], { hour: 'numeric' }))
  }

  return labels
}

export function buildScheduleCalendarJobs(
  schedules: RawSchedule[],
  days: ScheduleCalendarDay[],
  crewColorById: Map<string, number>,
  timezone: string,
  businessHours: BusinessHours,
  now: Date = new Date(),
  anchorJobIdByRuleId: Map<string, string> = new Map()
): ScheduleCalendarJob[] {
  const open = parseTimeToMinutes(businessHours.start)
  const close = parseTimeToMinutes(businessHours.end)

  return schedules
    .map((schedule) => {
      // Past recurring visits stay archived in the DB; only the active scheduled
      // instance should appear on the planning calendar.
      if (schedule.status === 'archived' && schedule.recurring_rule_id) {
        return null
      }

      if (!scheduleIsInWeek(schedule.start_time, days, timezone)) {
        return null
      }

      const client = unwrapRelation(schedule.client)
      const crew = unwrapRelation(schedule.crew)
      const dayIndex = resolveScheduleDayIndex(schedule.start_time, days, timezone)
      if (dayIndex < 0) {
        return null
      }
      const startMinutes = getMinutesFromMidnightInTimezone(schedule.start_time, timezone)
      const endMinutes = getMinutesFromMidnightInTimezone(schedule.end_time, timezone)
      const clippedStart = Math.max(startMinutes, open)
      const clippedEnd = Math.min(endMinutes, close)
      const durationMinutes = Math.max(
        SCHEDULE_CALENDAR_SNAP_MINUTES,
        clippedEnd - clippedStart
      )

      if (clippedEnd <= open || clippedStart >= close) {
        return null
      }

      const crewId = schedule.crew_id
      const colorIndex =
        crewId && crewColorById.has(crewId)
          ? crewColorById.get(crewId)!
          : -1

      const recurringRuleId = schedule.recurring_rule_id ?? null

      return {
        id: schedule.id,
        clientId: schedule.client_id,
        title: schedule.title,
        crewId,
        crewName: crew?.name || 'Unassigned',
        colorIndex,
        clientName: client?.name || 'Unknown client',
        location: client?.address || client?.name || 'No location',
        status: schedule.status,
        displayStatus: getDisplayStatus(
          schedule.status,
          schedule.start_time,
          schedule.end_time,
          now
        ),
        isDraggable: isScheduleJobDraggable(schedule.status),
        isProjected: false,
        recurringRuleId,
        anchorJobId: recurringRuleId
          ? anchorJobIdByRuleId.get(recurringRuleId) ?? schedule.id
          : null,
        occurrenceStart: schedule.occurrence_origin_start ?? schedule.start_time,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        dayIndex,
        startMinutes: clippedStart,
        durationMinutes,
      }
    })
    .filter((job): job is ScheduleCalendarJob => job !== null)
}

function scheduleCoversOccurrence(
  schedule: RawSchedule,
  occurrenceStartIso: string
): boolean {
  if (schedule.occurrence_origin_start) {
    return occurrenceTimesMatch(schedule.occurrence_origin_start, occurrenceStartIso)
  }

  return occurrenceTimesMatch(schedule.start_time, occurrenceStartIso)
}

function buildProjectedScheduleCalendarJob(input: {
  anchor: RecurringSeriesAnchor
  occurrenceStart: string
  occurrenceEnd: string
  days: ScheduleCalendarDay[]
  crewColorById: Map<string, number>
  timezone: string
  businessHours: BusinessHours
  now: Date
}): ScheduleCalendarJob | null {
  const open = parseTimeToMinutes(input.businessHours.start)
  const close = parseTimeToMinutes(input.businessHours.end)
  const schedule = input.anchor.schedule
  const client = unwrapRelation(schedule.client)
  const crew = unwrapRelation(schedule.crew)
  if (!scheduleIsInWeek(input.occurrenceStart, input.days, input.timezone)) {
    return null
  }

  const dayIndex = resolveScheduleDayIndex(input.occurrenceStart, input.days, input.timezone)
  if (dayIndex < 0) {
    return null
  }

  const startMinutes = getMinutesFromMidnightInTimezone(input.occurrenceStart, input.timezone)
  const endMinutes = getMinutesFromMidnightInTimezone(input.occurrenceEnd, input.timezone)
  const clippedStart = Math.max(startMinutes, open)
  const clippedEnd = Math.min(endMinutes, close)
  const durationMinutes = Math.max(
    SCHEDULE_CALENDAR_SNAP_MINUTES,
    clippedEnd - clippedStart
  )

  if (clippedEnd <= open || clippedStart >= close) {
    return null
  }

  const crewId = schedule.crew_id
  const colorIndex =
    crewId && input.crewColorById.has(crewId)
      ? input.crewColorById.get(crewId)!
      : -1

  return {
    id: buildProjectedScheduleId(schedule.recurring_rule_id!, input.occurrenceStart),
    clientId: schedule.client_id,
    title: schedule.title,
    crewId,
    crewName: crew?.name || 'Unassigned',
    colorIndex,
    clientName: client?.name || 'Unknown client',
    location: client?.address || client?.name || 'No location',
    status: 'scheduled',
    displayStatus: 'Scheduled',
    isDraggable: true,
    isProjected: true,
    recurringRuleId: schedule.recurring_rule_id ?? null,
    anchorJobId: schedule.id,
    occurrenceStart: input.occurrenceStart,
    startTime: input.occurrenceStart,
    endTime: input.occurrenceEnd,
    dayIndex,
    startMinutes: clippedStart,
    durationMinutes,
  }
}

export function mergeProjectedRecurringJobs(
  jobs: ScheduleCalendarJob[],
  schedules: RawSchedule[],
  recurringSeries: RecurringSeriesAnchor[],
  days: ScheduleCalendarDay[],
  crewColorById: Map<string, number>,
  timezone: string,
  businessHours: BusinessHours,
  now: Date = new Date()
): ScheduleCalendarJob[] {
  if (recurringSeries.length === 0) return jobs

  const rangeStart = new Date(days[0].startIso)
  const rangeEnd = new Date(days[6].endIso)
  const schedulesByRule = new Map<string, RawSchedule[]>()

  for (const schedule of schedules) {
    if (!schedule.recurring_rule_id) continue
    const list = schedulesByRule.get(schedule.recurring_rule_id) ?? []
    list.push(schedule)
    schedulesByRule.set(schedule.recurring_rule_id, list)
  }

  const projectedJobs: ScheduleCalendarJob[] = []

  for (const series of recurringSeries) {
    const ruleId = series.schedule.recurring_rule_id
    if (!ruleId) continue

    const durationMs =
      new Date(series.schedule.end_time).getTime() -
      new Date(series.schedule.start_time).getTime()
    const occurrences = projectRecurringOccurrences(
      new Date(series.schedule.start_time),
      durationMs,
      series.rule,
      rangeStart,
      rangeEnd
    )
    const ruleSchedules = schedulesByRule.get(ruleId) ?? []

    for (const occurrence of occurrences) {
      const occurrenceStart = occurrence.start.toISOString()
      const occurrenceEnd = occurrence.end.toISOString()
      const coveredBySchedule = ruleSchedules.some((schedule) =>
        scheduleCoversOccurrence(schedule, occurrenceStart)
      )
      const coveredByRenderedJob = jobs.some(
        (job) =>
          job.recurringRuleId === ruleId &&
          occurrenceTimesMatch(job.startTime, occurrenceStart)
      )

      if (coveredBySchedule || coveredByRenderedJob) continue

      const projected = buildProjectedScheduleCalendarJob({
        anchor: series,
        occurrenceStart,
        occurrenceEnd,
        days,
        crewColorById,
        timezone,
        businessHours,
        now,
      })

      if (projected) projectedJobs.push(projected)
    }
  }

  return [...jobs, ...projectedJobs].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )
}

export function buildScheduleCalendarData(input: {
  companyId: string
  timezone: string
  businessHours: BusinessHours
  weekOffset: number
  crews: RawCrew[]
  schedules: RawSchedule[]
  recurringSeries?: RecurringSeriesAnchor[]
  now?: Date
}): ScheduleCalendarData {
  const now = input.now ?? new Date()
  const week = getCompanyWeekDayBounds(input.timezone, now, input.weekOffset)
  const crewColorById = buildCrewColorIndexMap(input.crews)
  const anchorJobIdByRuleId = new Map(
    (input.recurringSeries ?? []).map((series) => [
      series.schedule.recurring_rule_id!,
      series.schedule.id,
    ])
  )
  const timelineDurationMinutes = getTimelineDurationMinutes(input.businessHours)
  const timelineHeightPx = (timelineDurationMinutes / 60) * SCHEDULE_CALENDAR_PIXELS_PER_HOUR

  const calendarCrews: ScheduleCalendarCrew[] = input.crews.map((crew, index) => ({
    id: crew.id,
    name: crew.name,
    colorIndex: index % SCHEDULE_CREW_COLORS.length,
  }))

  return {
    companyId: input.companyId,
    timezone: input.timezone,
    businessHours: input.businessHours,
    weekOffset: input.weekOffset,
    weekLabel: formatScheduleWeekLabel(
      input.timezone,
      week.weekStartDateStr,
      week.weekEndDateStr
    ),
    days: week.days,
    crews: calendarCrews,
    jobs: mergeProjectedRecurringJobs(
      buildScheduleCalendarJobs(
        input.schedules,
        week.days,
        crewColorById,
        input.timezone,
        input.businessHours,
        now,
        anchorJobIdByRuleId
      ),
      input.schedules,
      input.recurringSeries ?? [],
      week.days,
      crewColorById,
      input.timezone,
      input.businessHours,
      now
    ),
    timelineHeightPx,
    hourLabels: getCalendarHourLabels(input.businessHours),
  }
}

export function getCrewColorClasses(colorIndex: number) {
  if (colorIndex < 0) return UNASSIGNED_CREW_COLOR
  return SCHEDULE_CREW_COLORS[colorIndex % SCHEDULE_CREW_COLORS.length]
}