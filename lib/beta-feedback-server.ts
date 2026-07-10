import { createClient } from '@supabase/supabase-js'
import { getAppBaseUrl } from '@/lib/app-url'
import {
  getBetaFeedbackStatusLabel,
  getBetaFeedbackTypeLabel,
  normalizeBetaFeedbackStatus,
  normalizeBetaFeedbackType,
  type BetaFeedbackStatus,
  type BetaFeedbackType,
} from '@/lib/beta-feedback'
import { BETA_FEEDBACK_TEMPLATE_VARS } from '@/lib/email/resend-templates'
import { sendResendEmail } from '@/lib/email/resend'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type BetaFeedbackRecord = {
  id: string
  created_at: string
  feedback_type: BetaFeedbackType
  message: string
  status: BetaFeedbackStatus
  page_url: string | null
  user_agent: string | null
  submitter_user_id: string | null
  submitter_email: string | null
  submitter_name: string | null
  submitter_role: string | null
  company_id: string | null
  company_name: string | null
  metadata: Record<string, unknown> | null
}

export function getBetaFeedbackAdminEmail(): string {
  return (
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

function formatFeedbackEmail(record: BetaFeedbackRecord) {
  const typeLabel = getBetaFeedbackTypeLabel(record.feedback_type)
  const adminUrl = `${getAppBaseUrl()}/admin`
  const rows = [
    ['Type', typeLabel],
    ['From', record.submitter_name || 'Unknown'],
    ['Email', record.submitter_email || '—'],
    ['Role', record.submitter_role || '—'],
    ['Company', record.company_name || '—'],
    ['Page', record.page_url || '—'],
  ]

  const detailsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;vertical-align:top;">${escapeHtml(value)}</td></tr>`
    )
    .join('')

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;">
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">ServicePortal Beta</p>
      <h1 style="margin:0 0 16px;font-size:20px;">New ${escapeHtml(typeLabel)}</h1>
      <table style="margin:0 0 16px;font-size:14px;">${detailsHtml}</table>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;font-size:15px;white-space:pre-wrap;">${escapeHtml(record.message)}</div>
      <p style="margin:24px 0 0;">
        <a href="${adminUrl}" style="display:inline-block;background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Open admin dashboard</a>
      </p>
    </div>
  `

  const text = [
    `New ${typeLabel}`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    record.message,
    '',
    `Admin: ${adminUrl}`,
  ].join('\n')

  return {
    subject: `[ServicePortal Beta] ${typeLabel} from ${record.submitter_name || record.submitter_email || 'a user'}`,
    html,
    text,
    resendTemplate: {
      key: 'beta-feedback' as const,
      variables: {
        [BETA_FEEDBACK_TEMPLATE_VARS.feedbackType]: typeLabel,
        [BETA_FEEDBACK_TEMPLATE_VARS.submitterName]: record.submitter_name || 'Unknown',
        [BETA_FEEDBACK_TEMPLATE_VARS.submitterEmail]: record.submitter_email || '—',
        [BETA_FEEDBACK_TEMPLATE_VARS.submitterRole]: record.submitter_role || '—',
        [BETA_FEEDBACK_TEMPLATE_VARS.companyName]: record.company_name || '—',
        [BETA_FEEDBACK_TEMPLATE_VARS.pageUrl]: record.page_url || '—',
        [BETA_FEEDBACK_TEMPLATE_VARS.message]: record.message,
        [BETA_FEEDBACK_TEMPLATE_VARS.adminUrl]: adminUrl,
      },
    },
  }
}

export async function createBetaFeedbackSubmission(input: {
  feedbackType: BetaFeedbackType
  message: string
  pageUrl?: string | null
  userAgent?: string | null
  submitterUserId?: string | null
  submitterEmail?: string | null
  submitterName?: string | null
  submitterRole?: string | null
  companyId?: string | null
  companyName?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<
  { success: true; record: BetaFeedbackRecord } | { success: false; error: string }
> {
  const message = input.message.trim()
  if (!message) {
    return { success: false, error: 'Please enter your feedback' }
  }
  if (message.length > 8000) {
    return { success: false, error: 'Feedback is too long (max 8000 characters)' }
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('beta_feedback')
    .insert({
      feedback_type: input.feedbackType,
      message,
      page_url: input.pageUrl?.trim() || null,
      user_agent: input.userAgent?.trim() || null,
      submitter_user_id: input.submitterUserId || null,
      submitter_email: input.submitterEmail?.trim() || null,
      submitter_name: input.submitterName?.trim() || null,
      submitter_role: input.submitterRole || null,
      company_id: input.companyId || null,
      company_name: input.companyName?.trim() || null,
      metadata: input.metadata || null,
      status: 'new',
    })
    .select('*')
    .single()

  if (error || !data) {
    return { success: false, error: error?.message || 'Failed to save feedback' }
  }

  const record = mapBetaFeedbackRow(data)
  const adminEmail = getBetaFeedbackAdminEmail()
  if (adminEmail) {
    const email = formatFeedbackEmail(record)
    const emailResult = await sendResendEmail({
      to: adminEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: record.submitter_email,
      resendTemplate: email.resendTemplate,
    })

    if (!emailResult.ok) {
      console.error('beta feedback email failed:', emailResult.error)
    }
  }

  return { success: true, record }
}

function mapBetaFeedbackRow(row: Record<string, unknown>): BetaFeedbackRecord {
  return {
    id: String(row.id),
    created_at: String(row.created_at),
    feedback_type: normalizeBetaFeedbackType(String(row.feedback_type)) || 'other',
    message: String(row.message),
    status: normalizeBetaFeedbackStatus(String(row.status)),
    page_url: row.page_url ? String(row.page_url) : null,
    user_agent: row.user_agent ? String(row.user_agent) : null,
    submitter_user_id: row.submitter_user_id ? String(row.submitter_user_id) : null,
    submitter_email: row.submitter_email ? String(row.submitter_email) : null,
    submitter_name: row.submitter_name ? String(row.submitter_name) : null,
    submitter_role: row.submitter_role ? String(row.submitter_role) : null,
    company_id: row.company_id ? String(row.company_id) : null,
    company_name: row.company_name ? String(row.company_name) : null,
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : null,
  }
}

export async function listBetaFeedbackForAdmin(): Promise<BetaFeedbackRecord[]> {
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('beta_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw error
  return (data || []).map((row) => mapBetaFeedbackRow(row as Record<string, unknown>))
}

export async function updateBetaFeedbackStatus(
  feedbackId: string,
  status: BetaFeedbackStatus
): Promise<BetaFeedbackRecord | null> {
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('beta_feedback')
    .update({ status })
    .eq('id', feedbackId)
    .select('*')
    .single()

  if (error || !data) return null
  return mapBetaFeedbackRow(data as Record<string, unknown>)
}

export async function countNewBetaFeedback(): Promise<number> {
  const admin = createSupabaseAdmin()
  const { count, error } = await admin
    .from('beta_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new')

  if (error) return 0
  return count ?? 0
}