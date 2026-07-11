import { splitDatetimeLocal } from '@/lib/datetime-input'
import type { PlatformReleaseMode } from '@/lib/platform-settings'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export const BETA_SUNSET_WARNING_DAYS = 30

export type BetaSunsetWarning = {
  message: string
  releaseDateLabel: string
  daysUntilRelease: number
}

export type CompanyBillingSnapshot = {
  promo_code?: string | null
  stripe_platform_subscription_id?: string | null
}

export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}`
}

export function datetimeLocalToIso(value: string): string | null {
  if (!value?.trim()) return null
  const { date, time } = splitDatetimeLocal(value)
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = (time || '00:00').split(':').map(Number)
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return null
  const local = new Date(year, month - 1, day, hour, minute)
  if (Number.isNaN(local.getTime())) return null
  return local.toISOString()
}

export function isPastScheduledRelease(
  scheduledReleaseAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!scheduledReleaseAt) return false
  const releaseTime = new Date(scheduledReleaseAt).getTime()
  if (Number.isNaN(releaseTime)) return false
  return now.getTime() >= releaseTime
}

export function isInBetaSunsetWarningWindow(
  scheduledReleaseAt: string | null | undefined,
  now = new Date()
): boolean {
  if (!scheduledReleaseAt) return false
  const releaseTime = new Date(scheduledReleaseAt).getTime()
  if (Number.isNaN(releaseTime)) return false
  const warningStart = releaseTime - BETA_SUNSET_WARNING_DAYS * MS_PER_DAY
  return now.getTime() >= warningStart && now.getTime() < releaseTime
}

export function getDaysUntilRelease(
  scheduledReleaseAt: string,
  now = new Date()
): number {
  const releaseTime = new Date(scheduledReleaseAt).getTime()
  if (Number.isNaN(releaseTime)) return 0
  const ms = releaseTime - now.getTime()
  if (ms <= 0) return 0
  return Math.ceil(ms / MS_PER_DAY)
}

export function hasPaidPlatformSubscription(company: CompanyBillingSnapshot): boolean {
  return Boolean(company.stripe_platform_subscription_id?.trim())
}

export function formatScheduledReleaseLabel(
  scheduledReleaseAt: string,
  now = new Date()
): string {
  const date = new Date(scheduledReleaseAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function buildBetaSunsetWarning(
  releaseMode: PlatformReleaseMode,
  scheduledReleaseAt: string | null | undefined,
  company: CompanyBillingSnapshot,
  now = new Date()
): BetaSunsetWarning | null {
  if (releaseMode !== 'beta') return null
  if (!scheduledReleaseAt) return null
  if (!isInBetaSunsetWarningWindow(scheduledReleaseAt, now)) return null
  if (hasPaidPlatformSubscription(company)) return null

  const daysUntilRelease = getDaysUntilRelease(scheduledReleaseAt, now)
  const releaseDateLabel = formatScheduledReleaseLabel(scheduledReleaseAt, now)

  const dayPhrase =
    daysUntilRelease === 1
      ? 'tomorrow'
      : daysUntilRelease === 0
        ? 'today'
        : `in ${daysUntilRelease} days`

  return {
    daysUntilRelease,
    releaseDateLabel,
    message: `Full launch ${dayPhrase} (${releaseDateLabel}). Activate a subscription in Settings or your account will be locked out.`,
  }
}