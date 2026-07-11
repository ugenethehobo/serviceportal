export type ValidatedBetaAccessCode = {
  code: string
  grantsPlan: 'pro'
  kind: 'beta_access'
}

function loadBetaAccessCodes(): Set<string> {
  const raw = process.env.PLATFORM_BETA_ACCESS_CODES || ''
  return new Set(
    raw
      .split(',')
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function normalizeBetaAccessCodeInput(code: string): string {
  return code.trim()
}

export function validatePlatformBetaAccessCode(code: string): ValidatedBetaAccessCode | null {
  const normalized = normalizeBetaAccessCodeInput(code).toLowerCase()
  if (!normalized) return null

  const allowed = loadBetaAccessCodes()
  if (!allowed.has(normalized)) return null

  return {
    code: normalizeBetaAccessCodeInput(code),
    grantsPlan: 'pro',
    kind: 'beta_access',
  }
}

export function betaAccessAppliedLabel(): string {
  return 'Beta access applied'
}

export function isBetaAccessPromoCode(code: string | null | undefined): boolean {
  return Boolean(code?.trim().toLowerCase().startsWith('beta:'))
}