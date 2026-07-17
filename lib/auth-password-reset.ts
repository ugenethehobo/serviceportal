import { getAppBaseUrl } from '@/lib/app-url'

export const PASSWORD_RESET_NEXT_PATH = '/login/reset-password'

export function getPasswordResetRedirectUrl() {
  const base = getAppBaseUrl()
  const next = encodeURIComponent(PASSWORD_RESET_NEXT_PATH)
  return `${base}/auth/callback?next=${next}`
}

/** PKCE-friendly link that hits our callback with a recovery token hash. */
export function buildPasswordResetVerifyUrl(tokenHash: string) {
  const base = getAppBaseUrl()
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: 'recovery',
    next: PASSWORD_RESET_NEXT_PATH,
  })
  return `${base}/auth/callback?${params.toString()}`
}

// Re-export shared policy so existing imports keep working.
export {
  getPasswordRequirementsHint,
  isValidNewPassword,
  validatePassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '@/lib/password-policy'
