/**
 * Maps logical email types to Resend published template IDs (or aliases).
 * Set the env var to enable templates; leave unset to keep inline HTML fallback.
 */
export type ResendTemplateKey = 'password-reset' | 'notification' | 'beta-feedback'

const TEMPLATE_ENV_KEYS: Record<ResendTemplateKey, string> = {
  'password-reset': 'RESEND_TEMPLATE_PASSWORD_RESET',
  notification: 'RESEND_TEMPLATE_NOTIFICATION',
  'beta-feedback': 'RESEND_TEMPLATE_BETA_FEEDBACK',
}

export function getResendTemplateId(key: ResendTemplateKey): string | null {
  const envName = TEMPLATE_ENV_KEYS[key]
  const value = process.env[envName]?.trim()
  return value || null
}

export function isResendTemplateEnabled(key: ResendTemplateKey): boolean {
  return Boolean(getResendTemplateId(key))
}

/**
 * Variable names must match your published Resend templates exactly.
 * Reserved by Resend (do not use): FIRST_NAME, LAST_NAME, EMAIL, UNSUBSCRIBE_URL
 */
export type ResendTemplateVariables = Record<string, string | number>

/** Shared transactional notification shell (messages, estimates, invoices, etc.) */
export const NOTIFICATION_TEMPLATE_VARS = {
  companyName: 'COMPANY_NAME',
  title: 'TITLE',
  bodyHtml: 'BODY_HTML',
  ctaLabel: 'CTA_LABEL',
  ctaUrl: 'CTA_URL',
} as const

export const PASSWORD_RESET_TEMPLATE_VARS = {
  resetUrl: 'RESET_URL',
} as const

export const BETA_FEEDBACK_TEMPLATE_VARS = {
  feedbackType: 'FEEDBACK_TYPE',
  submitterName: 'SUBMITTER_NAME',
  submitterEmail: 'SUBMITTER_EMAIL',
  submitterRole: 'SUBMITTER_ROLE',
  companyName: 'COMPANY_NAME',
  pageUrl: 'PAGE_URL',
  message: 'MESSAGE',
  adminUrl: 'ADMIN_URL',
} as const

export function buildNotificationTemplateVars(input: {
  companyName: string
  title: string
  bodyHtml: string
  cta?: { label: string; href: string }
}): ResendTemplateVariables {
  return {
    [NOTIFICATION_TEMPLATE_VARS.companyName]: input.companyName,
    [NOTIFICATION_TEMPLATE_VARS.title]: input.title,
    [NOTIFICATION_TEMPLATE_VARS.bodyHtml]: input.bodyHtml,
    [NOTIFICATION_TEMPLATE_VARS.ctaLabel]: input.cta?.label ?? '',
    [NOTIFICATION_TEMPLATE_VARS.ctaUrl]: input.cta?.href ?? '',
  }
}