/**
 * Shared password rules for signup, invites, portal logins, and resets.
 * Intentionally stricter than "any 8+ characters" while staying usable on mobile.
 */

export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 128

export type PasswordPolicyChecks = {
  minLength: boolean
  hasLetter: boolean
  hasNumber: boolean
  maxLength: boolean
}

export type PasswordValidationResult = {
  ok: boolean
  error: string | null
  checks: PasswordPolicyChecks
}

export function getPasswordRequirementsHint(): string {
  return `At least ${PASSWORD_MIN_LENGTH} characters, including a letter and a number`
}

export function validatePassword(password: string): PasswordValidationResult {
  const value = typeof password === 'string' ? password : ''
  const checks: PasswordPolicyChecks = {
    minLength: value.length >= PASSWORD_MIN_LENGTH,
    maxLength: value.length <= PASSWORD_MAX_LENGTH,
    hasLetter: /[A-Za-z]/.test(value),
    hasNumber: /\d/.test(value),
  }

  const ok =
    checks.minLength && checks.maxLength && checks.hasLetter && checks.hasNumber

  let error: string | null = null
  if (!ok) {
    if (!value) {
      error = 'Password is required'
    } else if (!checks.minLength) {
      error = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
    } else if (!checks.maxLength) {
      error = `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
    } else if (!checks.hasLetter) {
      error = 'Password must include at least one letter'
    } else if (!checks.hasNumber) {
      error = 'Password must include at least one number'
    } else {
      error = getPasswordRequirementsHint()
    }
  }

  return { ok, error, checks }
}

/** Convenience boolean for forms that only need pass/fail. */
export function isValidNewPassword(password: string): boolean {
  return validatePassword(password).ok
}
