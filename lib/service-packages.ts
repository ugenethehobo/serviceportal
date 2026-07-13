import type { JobFormValues } from '@/components/dashboard/job-form-fields'
import { formatBookingDuration, formatBookingPrice } from '@/lib/booking-slots'
import { formatForDatetimeLocal, parseAsCompanyTime } from '@/lib/timezone'

export type ServicePackage = {
  id: string
  company_id: string
  name: string
  description: string | null
  duration_minutes: number
  price_estimate: number | null
  active: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export type ServicePackageDraft = {
  id?: string
  name: string
  description: string
  duration_minutes: number
  price_estimate: string
  active: boolean
}

/** Trim only leading/trailing whitespace; keep spaces and line breaks inside the text. */
export function normalizeServicePackageDescription(value: string): string | null {
  const trimmed = value.replace(/^\s+|\s+$/g, '')
  return trimmed.length > 0 ? trimmed : null
}

export function toEditableServicePackage(service?: ServicePackage): ServicePackageDraft {
  return {
    id: service?.id,
    name: service?.name || '',
    description: service?.description || '',
    duration_minutes: service?.duration_minutes || 60,
    price_estimate:
      service?.price_estimate != null ? String(service.price_estimate) : '',
    active: service?.active ?? true,
  }
}

export function normalizeServicePackageDraft(
  draft: ServicePackageDraft,
  index: number
): {
  id?: string
  name: string
  description: string | null
  duration_minutes: number
  price_estimate: number | null
  active: boolean
  sort_order: number
} | null {
  const name = draft.name.trim()
  if (!name) return null

  const priceRaw = draft.price_estimate.trim()
  const price = priceRaw ? Number(priceRaw) : null

  return {
    id: draft.id,
    name,
    description: normalizeServicePackageDescription(draft.description),
    duration_minutes: Math.min(480, Math.max(15, Math.round(draft.duration_minutes || 60))),
    price_estimate: price != null && !Number.isNaN(price) ? price : null,
    active: draft.active,
    sort_order: index,
  }
}

export function formatServicePackageSummary(pkg: ServicePackage): string {
  const parts = [formatBookingDuration(pkg.duration_minutes)]
  const price = formatBookingPrice(pkg.price_estimate)
  if (price) parts.push(price)
  return parts.join(' · ')
}

export function applyServicePackageToJobForm(
  pkg: ServicePackage,
  current: JobFormValues,
  companyTimezone: string
): JobFormValues {
  const next: JobFormValues = {
    ...current,
    title: pkg.name,
    description: pkg.description || '',
    price: pkg.price_estimate != null ? String(pkg.price_estimate) : '',
  }

  if (current.startTime && pkg.duration_minutes > 0) {
    const startUtc = parseAsCompanyTime(current.startTime, companyTimezone)
    const endUtc = new Date(
      new Date(startUtc).getTime() + pkg.duration_minutes * 60 * 1000
    ).toISOString()
    next.endTime = formatForDatetimeLocal(endUtc, companyTimezone)
  }

  return next
}

export function buildRequestedServicesNote(
  packages: ServicePackage[],
  extraNotes?: string
): string | null {
  const lines: string[] = []
  if (packages.length > 0) {
    lines.push(`Requested services: ${packages.map((pkg) => pkg.name).join(', ')}`)
  }
  if (extraNotes?.trim()) {
    lines.push(extraNotes.trim())
  }
  return lines.length > 0 ? lines.join('\n\n') : null
}

export function sumServicePackageEstimates(packages: ServicePackage[]): number | null {
  if (packages.length === 0) return null
  let total = 0
  let hasPrice = false
  for (const pkg of packages) {
    if (pkg.price_estimate != null) {
      total += pkg.price_estimate
      hasPrice = true
    }
  }
  return hasPrice ? total : null
}