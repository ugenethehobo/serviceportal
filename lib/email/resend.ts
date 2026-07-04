import { Resend } from 'resend'

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string | null
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
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY is not configured' }
  }

  const to = input.to.trim()
  if (!to) return { ok: false, error: 'Recipient email is required' }

  try {
    const resend = new Resend(apiKey)
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

    return { ok: true, id: data?.id }
  } catch (error: any) {
    return { ok: false, error: error.message || 'Failed to send email' }
  }
}