export type ActivityPeriod = '1w' | '2w' | '30d' | '60d' | 'all'

export type ActivityFeedItem = {
  id: string
  type: string
  title: string
  description: string
  href: string
  occurredAt: string
  urgent?: boolean
}

export const ACTIVITY_PERIOD_LABELS: Record<ActivityPeriod, string> = {
  '1w': '1 week',
  '2w': '2 weeks',
  '30d': '30 days',
  '60d': '60 days',
  all: 'All time',
}

const PERIOD_DAYS: Record<Exclude<ActivityPeriod, 'all'>, number> = {
  '1w': 7,
  '2w': 14,
  '30d': 30,
  '60d': 60,
}

export function filterActivityByPeriod(
  items: ActivityFeedItem[],
  period: ActivityPeriod,
  now = new Date()
) {
  if (period === 'all') return items

  const days = PERIOD_DAYS[period]
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - days)

  return items.filter((item) => {
    if (item.urgent) return true
    return new Date(item.occurredAt).getTime() >= cutoff.getTime()
  })
}

export function formatActivityWhen(iso: string, timezone: string) {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) {
    return date.toLocaleDateString([], { timeZone: timezone, weekday: 'short' })
  }
  return date.toLocaleDateString([], {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
  })
}

export function sortActivityItems(items: ActivityFeedItem[], limit = 50) {
  return [...items]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit)
}