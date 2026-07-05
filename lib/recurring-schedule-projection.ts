export type RecurringRule = {
  id: string
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
}

export type RecurringOccurrence = {
  start: Date
  end: Date
}

const MAX_RECURRING_STEPS = 520

export function advanceRecurringDate(date: Date, rule: RecurringRule): Date {
  const next = new Date(date)
  const step = rule.interval || 1

  switch (rule.frequency) {
    case 'daily':
      next.setDate(next.getDate() + step)
      break
    case 'weekly':
      next.setDate(next.getDate() + 7 * step)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + step)
      break
  }

  return next
}

export function retreatRecurringDate(date: Date, rule: RecurringRule): Date {
  const prev = new Date(date)
  const step = rule.interval || 1

  switch (rule.frequency) {
    case 'daily':
      prev.setDate(prev.getDate() - step)
      break
    case 'weekly':
      prev.setDate(prev.getDate() - 7 * step)
      break
    case 'monthly':
      prev.setMonth(prev.getMonth() - step)
      break
  }

  return prev
}

export function projectRecurringOccurrences(
  anchorStart: Date,
  durationMs: number,
  rule: RecurringRule,
  rangeStart: Date,
  rangeEnd: Date
): RecurringOccurrence[] {
  let cursor = new Date(anchorStart)
  let steps = 0

  while (cursor > rangeStart && steps < MAX_RECURRING_STEPS) {
    cursor = retreatRecurringDate(cursor, rule)
    steps++
  }

  steps = 0
  while (cursor < rangeStart && steps < MAX_RECURRING_STEPS) {
    const next = advanceRecurringDate(cursor, rule)
    if (next >= rangeStart) break
    cursor = next
    steps++
  }

  const results: RecurringOccurrence[] = []
  steps = 0

  while (cursor < rangeEnd && steps < MAX_RECURRING_STEPS) {
    if (cursor >= rangeStart) {
      results.push({
        start: new Date(cursor),
        end: new Date(cursor.getTime() + durationMs),
      })
    }
    cursor = advanceRecurringDate(cursor, rule)
    steps++
  }

  return results
}

export function buildProjectedScheduleId(ruleId: string, occurrenceStartIso: string): string {
  return `projected:${ruleId}:${new Date(occurrenceStartIso).getTime()}`
}

export function parseProjectedScheduleId(id: string): {
  ruleId: string
  occurrenceStartMs: number
} | null {
  const match = /^projected:([^:]+):(\d+)$/.exec(id)
  if (!match) return null
  return {
    ruleId: match[1],
    occurrenceStartMs: Number(match[2]),
  }
}

export function occurrenceTimesMatch(aIso: string, bIso: string, toleranceMs = 60_000): boolean {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) <= toleranceMs
}