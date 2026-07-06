/** Parse YYYY-MM-DD into a local Date (no timezone shift). */
export function parseDateValue(value: string): Date | undefined {
  if (!value?.trim()) return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

/** Format a Date as YYYY-MM-DD in local time. */
export function formatDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function splitDatetimeLocal(value: string): { date: string; time: string } {
  if (!value?.trim()) return { date: '', time: '' }
  const [date, time] = value.split('T')
  return { date: date || '', time: (time || '').slice(0, 5) }
}

export function joinDatetimeLocal(date: string, time: string): string {
  if (!date) return ''
  return `${date}T${time || '00:00'}`
}

export function splitTimeValue(value: string): { hour: string; minute: string } {
  if (!value?.trim()) return { hour: '', minute: '' }
  const [hour, minute] = value.split(':')
  return { hour: hour || '', minute: minute || '' }
}

export function joinTimeValue(hour: string, minute: string): string {
  if (!hour) return ''
  return `${hour.padStart(2, '0')}:${(minute || '00').padStart(2, '0')}`
}

export function formatDateLabel(value: string): string {
  const date = parseDateValue(value)
  if (!date) return ''
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDatetimeLabel(value: string): string {
  const { date, time } = splitDatetimeLocal(value)
  if (!date) return ''
  const dateLabel = formatDateLabel(date)
  if (!time) return dateLabel
  const [hour, minute] = time.split(':').map(Number)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return dateLabel
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${dateLabel} · ${hour12}:${String(minute).padStart(2, '0')} ${period}`
}