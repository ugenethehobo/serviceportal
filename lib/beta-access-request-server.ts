import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from '@/lib/email/resend'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export function getBetaAccessAdminEmail(): string {
  return (
    process.env.BETA_ACCESS_ADMIN_EMAIL?.trim() ||
    process.env.BETA_FEEDBACK_ADMIN_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim() ||
    ''
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function createBetaAccessRequest(input: {
  fullName: string
  email: string
  companyName: string
  phone?: string | null
  teamSize?: string | null
  message?: string | null
}): Promise<{ success: true } | { success: false; error: string }> {
  const fullName = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  const companyName = input.companyName.trim()
  const phone = input.phone?.trim() || null
  const teamSize = input.teamSize?.trim() || null
  const message = input.message?.trim() || null

  if (!fullName) return { success: false, error: 'Your name is required' }
  if (!email || !email.includes('@')) return { success: false, error: 'Enter a valid email address' }
  if (!companyName) return { success: false, error: 'Company name is required' }
  if (message && message.length > 4000) {
    return { success: false, error: 'Message is too long (max 4000 characters)' }
  }

  const admin = createSupabaseAdmin()
  const { error } = await admin.from('beta_access_requests').insert({
    full_name: fullName,
    email,
    company_name: companyName,
    phone,
    team_size: teamSize,
    message,
    status: 'new',
  })

  if (error?.code !== '42P01' && error) {
    return { success: false, error: error.message || 'Failed to save your request' }
  }

  const adminEmail = getBetaAccessAdminEmail()
  if (adminEmail) {
    const rows = [
      ['Name', fullName],
      ['Email', email],
      ['Company', companyName],
      ['Phone', phone || '—'],
      ['Team size', teamSize || '—'],
    ]

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;">
        <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">ServicePortal</p>
        <h1 style="margin:0 0 16px;font-size:20px;">New beta access request</h1>
        <table style="margin:0 0 16px;font-size:14px;">
          ${rows
            .map(
              ([label, value]) =>
                `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`
            )
            .join('')}
        </table>
        ${
          message
            ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;font-size:15px;white-space:pre-wrap;">${escapeHtml(message)}</div>`
            : ''
        }
      </div>
    `

    const text = [
      'New beta access request',
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      message || '',
    ].join('\n')

    const emailResult = await sendResendEmail({
      to: adminEmail,
      subject: `[ServicePortal] Beta access request from ${fullName}`,
      html,
      text,
      replyTo: email,
    })

    if (!emailResult.ok) {
      console.error('beta access request email failed:', emailResult.error)
    }
  }

  return { success: true }
}