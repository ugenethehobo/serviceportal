import type { PlatformPlanId } from '@/lib/platform-billing'

export type PlatformPromoKind = 'dev_comp'

export type ValidatedPlatformPromo = {
  code: string
  kind: PlatformPromoKind
  /** Grants the selected paid tier without Stripe billing */
  grantsFreeAccess: true
}

function loadDevPromoCodes(): Set<string> {
  const raw =
    process.env.PLATFORM_DEV_PROMO_CODES ||
    process.env.PLATFORM_DEV_PROMO_CODE ||
    ''

  return new Set(
    raw
      .split(',')
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function normalizePromoCodeInput(code: string): string {
  return code.trim()
}

export function validatePlatformDevPromoCode(
  code: string,
  plan: PlatformPlanId
): ValidatedPlatformPromo | null {
  if (plan !== 'basic' && plan !== 'pro') return null

  const normalized = normalizePromoCodeInput(code).toLowerCase()
  if (!normalized) return null

  const allowed = loadDevPromoCodes()
  if (!allowed.has(normalized)) return null

  return {
    code: normalizePromoCodeInput(code),
    kind: 'dev_comp',
    grantsFreeAccess: true,
  }
}

export function isDevCompedCompany(company: {
  promo_code?: string | null
  subscription_status?: string | null
}): boolean {
  return Boolean(company.promo_code?.trim())
}