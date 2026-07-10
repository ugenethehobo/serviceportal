import { Resend } from 'resend'
import {
  getResendTemplateId,
  type ResendTemplateKey,
  type ResendTemplateVariables,
} from '@/lib/email/resend-templates'

export type SendEmailInput = {
  to: string
  subject: string
  /** Inline HTML fallback — always provide while migrating to templates */
  html: string
  text?: string
  replyTo?: string | null
  /**
   * When the env var for this key is set, Resend sends using the published
   * template instead of inline html/text.
   */
  resendTemplate?: {
    key: ResendTemplateKey
    variables: ResendTemplateVariables
  }
}

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

export function getResendFromAddress() {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    'onboarding@resend.dev'
  )
}

export async function sendResendEmail(
  input: SendEmailInput
): Promise<{ ok: true; id?: string; usedTemplate: boolean } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY is not configured' }
  }

  const to = input.to.trim()
  if (!to) return { ok: false, error: 'Recipient email is required' }

  const templateId = input.resendTemplate
    ? getResendTemplateId(input.resendTemplate.key)
    : null

  try {
    const resend = new Resend(apiKey)

    if (templateId && input.resendTemplate) {
      const { data, error } = await resend.emails.send({
        from: getResendFromAddress(),
        to,
        subject: input.subject,
        replyTo: input.replyTo || undefined,
        template: {
          id: templateId,
          variables: input.resendTemplate.variables,
        },
      })

      if (error) {
        return { ok: false, error: error.message || 'Failed to send email' }
      }

      return { ok: true, id: data?.id, usedTemplate: true }
    }

    const { data, error } = await resend.emails.send({
      from: getResendFromAddress(),
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo || undefined,
    })

    if (error) {
      return { ok: false, error: error.message || 'Failed to send email' }
    }

    return { ok: true, id: data?.id, usedTemplate: false }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send email'
    return { ok: false, error: message }
  }
}