import { sendResendEmail } from '@/lib/email/resend'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildPasswordResetHtml(resetUrl: string) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:560px;">
      <h1 style="margin:0 0 16px;font-size:20px;">Reset your password</h1>
      <p style="margin:0 0 16px;font-size:15px;">
        We received a request to reset your ServicePortal password. Click the button below to choose a new one.
      </p>
      <p style="margin:0 0 16px;font-size:15px;">
        This link expires after a short time. If you did not request a reset, you can ignore this email.
      </p>
      <p style="margin:24px 0 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">
          Reset password
        </a>
      </p>
      <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">
        Or copy this link into your browser:<br />
        <span style="word-break:break-all;">${escapeHtml(resetUrl)}</span>
      </p>
      <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">Sent by ServicePortal</p>
    </div>
  `
}

export async function sendPasswordResetEmail(input: {
  to: string
  resetUrl: string
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const resetUrl = input.resetUrl.trim()
  if (!resetUrl) {
    return { ok: false, error: 'Reset URL is required' }
  }

  return sendResendEmail({
    to: input.to,
    subject: 'Reset your ServicePortal password',
    html: buildPasswordResetHtml(resetUrl),
    text: `Reset your ServicePortal password: ${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
  })
}