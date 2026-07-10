import type { SupabaseClient } from '@supabase/supabase-js'
import { getAppBaseUrl } from '@/lib/app-url'
import { buildNotificationTemplateVars } from '@/lib/email/resend-templates'
import { sendResendEmail, isResendConfigured } from '@/lib/email/resend'
import type { ResendTemplateKey, ResendTemplateVariables } from '@/lib/email/resend-templates'
import { sendTextbeltSms } from '@/lib/sms/textbelt'
import {
  isChannelEnabledForEvent,
  normalizeNotificationPreferences,
  type NotificationChannel,
  type NotificationEvent,
  type NotificationPreferences,
} from '@/lib/notifications'

type NotificationPayload = {
  companyId: string
  event: NotificationEvent
  email?: {
    to: string
    subject: string
    html: string
    text?: string
    resendTemplate?: {
      key: ResendTemplateKey
      variables: ResendTemplateVariables
    }
  }
  sms?: {
    phone: string
    message: string
  }
  metadata?: Record<string, unknown>
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildNotificationEmail(
  companyName: string,
  title: string,
  bodyHtml: string,
  cta?: { label: string; href: string }
) {
  const ctaHtml = cta
    ? `<p style="margin:24px 0 0;"><a href="${cta.href}" style="display:inline-block;background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">${escapeHtml(cta.label)}</a></p>`
    : ''

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:560px;">
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(companyName)}</p>
      <h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(title)}</h1>
      <div style="font-size:15px;">${bodyHtml}</div>
      ${ctaHtml}
      <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">Sent by Service Portal</p>
    </div>
  `

  return {
    html,
    resendTemplate: {
      key: 'notification' as const,
      variables: buildNotificationTemplateVars({ companyName, title, bodyHtml, cta }),
    },
  }
}

async function logNotification(
  supabaseAdmin: SupabaseClient,
  entry: {
    companyId: string
    event: NotificationEvent
    channel: NotificationChannel
    recipient: string
    subject?: string
    status: 'sent' | 'failed' | 'skipped'
    errorMessage?: string
    metadata?: Record<string, unknown>
  }
) {
  try {
    await supabaseAdmin.from('notification_log').insert({
      company_id: entry.companyId,
      event_type: entry.event,
      channel: entry.channel,
      recipient: entry.recipient,
      subject: entry.subject || null,
      status: entry.status,
      error_message: entry.errorMessage || null,
      metadata: entry.metadata || null,
    })
  } catch {
    // Logging should never break the main flow.
  }
}

async function getCompanyNotificationContext(
  supabaseAdmin: SupabaseClient,
  companyId: string
) {
  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('name, notification_settings')
    .eq('id', companyId)
    .single()

  return {
    companyName: company?.name?.trim() || 'Your service company',
    preferences: normalizeNotificationPreferences(company?.notification_settings),
  }
}

export async function getStaffEmailsForCompany(
  supabaseAdmin: SupabaseClient,
  companyId: string
) {
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('email, role')
    .eq('company_id', companyId)
    .in('role', ['company_admin', 'team_member'])

  const emails = new Set<string>()
  for (const profile of profiles || []) {
    const email = profile.email?.trim()
    if (email) emails.add(email)
  }
  return Array.from(emails)
}

export async function dispatchNotification(
  supabaseAdmin: SupabaseClient,
  payload: NotificationPayload
) {
  const { companyName, preferences } = await getCompanyNotificationContext(
    supabaseAdmin,
    payload.companyId
  )

  if (payload.email) {
    const enabled = isChannelEnabledForEvent(preferences, payload.event, 'email')
    if (!enabled) {
      await logNotification(supabaseAdmin, {
        companyId: payload.companyId,
        event: payload.event,
        channel: 'email',
        recipient: payload.email.to,
        subject: payload.email.subject,
        status: 'skipped',
        metadata: payload.metadata,
      })
    } else if (!isResendConfigured()) {
      await logNotification(supabaseAdmin, {
        companyId: payload.companyId,
        event: payload.event,
        channel: 'email',
        recipient: payload.email.to,
        subject: payload.email.subject,
        status: 'skipped',
        errorMessage: 'RESEND_API_KEY is not configured',
        metadata: payload.metadata,
      })
    } else {
      const result = await sendResendEmail({
        to: payload.email.to,
        subject: payload.email.subject,
        html: payload.email.html,
        text: payload.email.text,
        replyTo: preferences.reply_to_email,
        resendTemplate: payload.email.resendTemplate,
      })

      await logNotification(supabaseAdmin, {
        companyId: payload.companyId,
        event: payload.event,
        channel: 'email',
        recipient: payload.email.to,
        subject: payload.email.subject,
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? undefined : result.error,
        metadata: payload.metadata,
      })
    }
  }

  if (payload.sms) {
    const enabled = isChannelEnabledForEvent(preferences, payload.event, 'sms')
    if (!enabled) {
      await logNotification(supabaseAdmin, {
        companyId: payload.companyId,
        event: payload.event,
        channel: 'sms',
        recipient: payload.sms.phone,
        status: 'skipped',
        metadata: payload.metadata,
      })
    } else {
      const result = await sendTextbeltSms({
        phone: payload.sms.phone,
        message: payload.sms.message,
      })

      await logNotification(supabaseAdmin, {
        companyId: payload.companyId,
        event: payload.event,
        channel: 'sms',
        recipient: payload.sms.phone,
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? undefined : result.error,
        metadata: payload.metadata,
      })
    }
  }
}

export async function notifyClientMessageFromStaff(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string
    companyName?: string
    clientEmail?: string | null
    clientPhone?: string | null
    clientName?: string | null
    messagePreview: string
    scheduleId?: string | null
  }
) {
  const baseUrl = getAppBaseUrl()
  const portalUrl = `${baseUrl}/portal/messages`
  const preview = input.messagePreview.trim().slice(0, 280)
  const companyName = input.companyName?.trim() || 'Your service company'
  const clientLabel = input.clientName?.trim() || 'there'

  await dispatchNotification(supabaseAdmin, {
    companyId: input.companyId,
    event: 'message_from_staff',
    email: input.clientEmail
      ? {
          to: input.clientEmail,
          subject: `New message from ${companyName}`,
          ...buildNotificationEmail(
            companyName,
            'You have a new message',
            `<p>Hi ${escapeHtml(clientLabel)},</p><p>${escapeHtml(companyName)} sent you a message:</p><blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #d1d5db;background:#f9fafb;">${escapeHtml(preview)}</blockquote>`,
            { label: 'View message', href: portalUrl }
          ),
          text: `${companyName} sent you a message: ${preview}\n\nView it at ${portalUrl}`,
        }
      : undefined,
    sms: input.clientPhone
      ? {
          phone: input.clientPhone,
          message: `${companyName}: ${preview}${preview.length >= 280 ? '…' : ''} View: ${portalUrl}`,
        }
      : undefined,
    metadata: { schedule_id: input.scheduleId || null },
  })
}

export async function notifyStaffMessageFromClient(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string
    companyName?: string
    clientName?: string | null
    messagePreview: string
    clientId: string
    scheduleId?: string | null
  }
) {
  const staffEmails = await getStaffEmailsForCompany(supabaseAdmin, input.companyId)
  if (staffEmails.length === 0) return

  const baseUrl = getAppBaseUrl()
  const clientLabel = input.clientName?.trim() || 'A client'
  const companyName = input.companyName?.trim() || 'Service Portal'
  const preview = input.messagePreview.trim().slice(0, 280)
  const threadUrl = input.scheduleId
    ? `${baseUrl}/dashboard/clients/${input.clientId}/jobs/${input.scheduleId}?tab=messaging`
    : `${baseUrl}/dashboard/clients/${input.clientId}?tab=messaging`

  for (const email of staffEmails) {
    await dispatchNotification(supabaseAdmin, {
      companyId: input.companyId,
      event: 'message_from_client',
      email: {
        to: email,
        subject: `New message from ${clientLabel}`,
        ...buildNotificationEmail(
          companyName,
          'New client message',
          `<p>${escapeHtml(clientLabel)} sent a message:</p><blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #d1d5db;background:#f9fafb;">${escapeHtml(preview)}</blockquote>`,
          { label: 'Open conversation', href: threadUrl }
        ),
        text: `${clientLabel} sent a message: ${preview}\n\nOpen: ${threadUrl}`,
      },
      metadata: { client_id: input.clientId, schedule_id: input.scheduleId || null },
    })
  }
}

export async function notifyClientEstimateSent(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string
    companyName?: string
    clientId?: string | null
    clientEmail?: string | null
    clientPhone?: string | null
    clientName?: string | null
    estimateTitle: string
    estimateTotal: number
    estimateId: string
  }
) {
  const baseUrl = getAppBaseUrl()
  const portalUrl = `${baseUrl}/portal/estimates`
  const companyName = input.companyName?.trim() || 'Your service company'
  const clientLabel = input.clientName?.trim() || 'there'
  const amount = `$${Number(input.estimateTotal).toFixed(2)}`

  const { queueCompanyZapierEvent } = await import('@/lib/integration-events')
  queueCompanyZapierEvent(supabaseAdmin, {
    companyId: input.companyId,
    event: 'estimate_sent',
    data: {
      estimate_id: input.estimateId,
      client_id: input.clientId ?? null,
      estimate_title: input.estimateTitle,
      estimate_total: input.estimateTotal,
      client_name: input.clientName ?? null,
      client_email: input.clientEmail ?? null,
    },
  })

  await dispatchNotification(supabaseAdmin, {
    companyId: input.companyId,
    event: 'estimate_sent',
    email: input.clientEmail
      ? {
          to: input.clientEmail,
          subject: `Estimate ready: ${input.estimateTitle}`,
          ...buildNotificationEmail(
            companyName,
            'Your estimate is ready',
            `<p>Hi ${escapeHtml(clientLabel)},</p><p><strong>${escapeHtml(input.estimateTitle)}</strong> is ready for review. Total: <strong>${escapeHtml(amount)}</strong>.</p>`,
            { label: 'View estimate', href: portalUrl }
          ),
          text: `${companyName} sent you an estimate: ${input.estimateTitle} (${amount}). View: ${portalUrl}`,
        }
      : undefined,
    sms: input.clientPhone
      ? {
          phone: input.clientPhone,
          message: `${companyName}: Estimate "${input.estimateTitle}" (${amount}) is ready. ${portalUrl}`,
        }
      : undefined,
    metadata: { estimate_id: input.estimateId },
  })
}

export async function notifyClientInvoiceSent(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string
    companyName?: string
    clientId?: string | null
    clientEmail?: string | null
    clientPhone?: string | null
    clientName?: string | null
    jobTitle: string
    balanceDue: number
    scheduleId: string
  }
) {
  const baseUrl = getAppBaseUrl()
  const portalUrl = `${baseUrl}/portal/documents`
  const companyName = input.companyName?.trim() || 'Your service company'
  const clientLabel = input.clientName?.trim() || 'there'
  const amount = `$${Number(input.balanceDue).toFixed(2)}`

  const { queueCompanyZapierEvent } = await import('@/lib/integration-events')
  queueCompanyZapierEvent(supabaseAdmin, {
    companyId: input.companyId,
    event: 'invoice_sent',
    data: {
      schedule_id: input.scheduleId,
      client_id: input.clientId ?? null,
      job_title: input.jobTitle,
      balance_due: input.balanceDue,
      client_name: input.clientName ?? null,
      client_email: input.clientEmail ?? null,
    },
  })

  await dispatchNotification(supabaseAdmin, {
    companyId: input.companyId,
    event: 'invoice_sent',
    email: input.clientEmail
      ? {
          to: input.clientEmail,
          subject: `Invoice for ${input.jobTitle}`,
          ...buildNotificationEmail(
            companyName,
            'Your invoice is ready',
            `<p>Hi ${escapeHtml(clientLabel)},</p><p>Your invoice for <strong>${escapeHtml(input.jobTitle)}</strong> is ready.${input.balanceDue > 0 ? ` Balance due: <strong>${escapeHtml(amount)}</strong>.` : ' This job is paid in full.'}</p>`,
            { label: 'View invoice', href: portalUrl }
          ),
          text: `${companyName} sent an invoice for ${input.jobTitle}${input.balanceDue > 0 ? ` (${amount} due)` : ''}. View: ${portalUrl}`,
        }
      : undefined,
    sms: input.clientPhone
      ? {
          phone: input.clientPhone,
          message: `${companyName}: Invoice for "${input.jobTitle}"${input.balanceDue > 0 ? ` — ${amount} due` : ''}. ${portalUrl}`,
        }
      : undefined,
    metadata: { schedule_id: input.scheduleId },
  })
}

export async function notifyStaffEstimateResponse(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string
    companyName?: string
    clientName?: string | null
    estimateTitle: string
    response: 'accepted' | 'declined'
    clientId: string
    estimateId: string
  }
) {
  const staffEmails = await getStaffEmailsForCompany(supabaseAdmin, input.companyId)
  if (staffEmails.length === 0) return

  const baseUrl = getAppBaseUrl()
  const clientLabel = input.clientName?.trim() || 'A client'
  const companyName = input.companyName?.trim() || 'Service Portal'
  const responseLabel = input.response === 'accepted' ? 'accepted' : 'declined'
  const estimatesUrl = `${baseUrl}/dashboard/clients/${input.clientId}?tab=estimates`

  for (const email of staffEmails) {
    await dispatchNotification(supabaseAdmin, {
      companyId: input.companyId,
      event: 'estimate_response',
      email: {
        to: email,
        subject: `${clientLabel} ${responseLabel} estimate: ${input.estimateTitle}`,
        ...buildNotificationEmail(
          companyName,
          `Estimate ${responseLabel}`,
          `<p>${escapeHtml(clientLabel)} <strong>${responseLabel}</strong> the estimate <strong>${escapeHtml(input.estimateTitle)}</strong>.</p>`,
          { label: 'View estimates', href: estimatesUrl }
        ),
        text: `${clientLabel} ${responseLabel} estimate "${input.estimateTitle}". View: ${estimatesUrl}`,
      },
      metadata: { estimate_id: input.estimateId, response: input.response },
    })
  }
}

export async function notifyPaymentReceived(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string
    companyName?: string
    clientEmail?: string | null
    clientName?: string | null
    jobTitle: string
    amount: number
    scheduleId: string
    clientId: string
    paymentMethod?: string | null
  }
) {
  const staffEmails = await getStaffEmailsForCompany(supabaseAdmin, input.companyId)
  const baseUrl = getAppBaseUrl()
  const companyName = input.companyName?.trim() || 'Your service company'
  const clientLabel = input.clientName?.trim() || 'there'
  const amountLabel = `$${Number(input.amount).toFixed(2)}`
  const jobUrl = `${baseUrl}/dashboard/clients/${input.clientId}/jobs/${input.scheduleId}?tab=billing`

  const { queueCompanyZapierEvent } = await import('@/lib/integration-events')
  queueCompanyZapierEvent(supabaseAdmin, {
    companyId: input.companyId,
    event: 'payment_received',
    data: {
      schedule_id: input.scheduleId,
      client_id: input.clientId,
      job_title: input.jobTitle,
      amount: input.amount,
      client_name: input.clientName ?? null,
      payment_method: input.paymentMethod ?? null,
    },
  })

  if (input.clientEmail) {
    await dispatchNotification(supabaseAdmin, {
      companyId: input.companyId,
      event: 'payment_received',
      email: {
        to: input.clientEmail,
        subject: `Payment received for ${input.jobTitle}`,
        ...buildNotificationEmail(
          companyName,
          'Payment received',
          `<p>Hi ${escapeHtml(clientLabel)},</p><p>We received your payment of <strong>${escapeHtml(amountLabel)}</strong> for <strong>${escapeHtml(input.jobTitle)}</strong>. Thank you!</p>`
        ),
        text: `Payment of ${amountLabel} received for ${input.jobTitle}.`,
      },
      metadata: { schedule_id: input.scheduleId, audience: 'client' },
    })
  }

  for (const email of staffEmails) {
    await dispatchNotification(supabaseAdmin, {
      companyId: input.companyId,
      event: 'payment_received',
      email: {
        to: email,
        subject: `Payment received: ${input.jobTitle}`,
        ...buildNotificationEmail(
          companyName,
          'Payment received',
          `<p>A payment of <strong>${escapeHtml(amountLabel)}</strong> was received for <strong>${escapeHtml(input.jobTitle)}</strong>.</p>`,
          { label: 'View billing', href: jobUrl }
        ),
        text: `Payment of ${amountLabel} received for ${input.jobTitle}. View: ${jobUrl}`,
      },
      metadata: { schedule_id: input.scheduleId, audience: 'staff' },
    })
  }
}

export async function notifyStaffOnlineBookingReceived(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string
    companyName?: string
    clientId: string
    clientName: string
    clientEmail?: string | null
    clientPhone?: string | null
    jobTitle: string
    serviceName: string
    startTime: string
    endTime: string
    scheduleId: string
    crewName?: string | null
  }
) {
  const staffEmails = await getStaffEmailsForCompany(supabaseAdmin, input.companyId)
  if (staffEmails.length === 0) return

  const baseUrl = getAppBaseUrl()
  const companyName = input.companyName?.trim() || 'Service Portal'
  const when = new Date(input.startTime).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const jobUrl = `${baseUrl}/dashboard/clients/${input.clientId}/jobs/${input.scheduleId}`
  const contactBits = [
    input.clientEmail ? `Email: ${input.clientEmail}` : null,
    input.clientPhone ? `Phone: ${input.clientPhone}` : null,
  ].filter(Boolean)
  const crewLine = input.crewName
    ? `<p>Assigned crew: <strong>${escapeHtml(input.crewName)}</strong></p>`
    : ''

  for (const email of staffEmails) {
    await dispatchNotification(supabaseAdmin, {
      companyId: input.companyId,
      event: 'online_booking_received',
      email: {
        to: email,
        subject: `New online booking: ${input.clientName}`,
        ...buildNotificationEmail(
          companyName,
          'New online booking',
          `<p><strong>${escapeHtml(input.clientName)}</strong> booked <strong>${escapeHtml(input.serviceName)}</strong> for <strong>${escapeHtml(when)}</strong>.</p>${crewLine}${contactBits.length ? `<p>${contactBits.map((line) => escapeHtml(line!)).join('<br/>')}</p>` : ''}`,
          { label: 'View job', href: jobUrl }
        ),
        text: `${input.clientName} booked ${input.serviceName} for ${when}. View: ${jobUrl}`,
      },
      metadata: {
        schedule_id: input.scheduleId,
        client_id: input.clientId,
        source: 'online_booking',
      },
    })
  }
}

export async function notifyClientBookingConfirmed(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string
    companyName?: string
    clientId: string
    clientEmail?: string | null
    clientPhone?: string | null
    clientName?: string | null
    jobTitle: string
    startTime: string
    scheduleId: string
  }
) {
  const baseUrl = getAppBaseUrl()
  const portalUrl = `${baseUrl}/portal/jobs`
  const companyName = input.companyName?.trim() || 'Your service company'
  const clientLabel = input.clientName?.trim() || 'there'
  const when = new Date(input.startTime).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  await dispatchNotification(supabaseAdmin, {
    companyId: input.companyId,
    event: 'visit_reminder',
    email: input.clientEmail
      ? {
          to: input.clientEmail,
          subject: `Visit confirmed with ${companyName}`,
          ...buildNotificationEmail(
            companyName,
            'Your visit is confirmed',
            `<p>Hi ${escapeHtml(clientLabel)},</p><p>Your booking for <strong>${escapeHtml(input.jobTitle)}</strong> is confirmed for <strong>${escapeHtml(when)}</strong>.</p>`,
            { label: 'View your visits', href: portalUrl }
          ),
          text: `Your visit "${input.jobTitle}" is confirmed for ${when}. View: ${portalUrl}`,
        }
      : undefined,
    sms: input.clientPhone
      ? {
          phone: input.clientPhone,
          message: `${companyName}: "${input.jobTitle}" confirmed for ${when}. ${portalUrl}`,
        }
      : undefined,
    metadata: {
      schedule_id: input.scheduleId,
      client_id: input.clientId,
      source: 'online_booking',
    },
  })
}

export async function notifyClientVisitReminder(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string
    companyName?: string
    clientId: string
    clientEmail?: string | null
    clientPhone?: string | null
    clientName?: string | null
    jobTitle: string
    startTime: string
    endTime: string
    scheduleId: string
    visitDay: string
  }
) {
  const baseUrl = getAppBaseUrl()
  const portalUrl = `${baseUrl}/portal/jobs`
  const companyName = input.companyName?.trim() || 'Your service company'
  const clientLabel = input.clientName?.trim() || 'there'
  const when = new Date(input.startTime).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  await dispatchNotification(supabaseAdmin, {
    companyId: input.companyId,
    event: 'visit_reminder',
    email: input.clientEmail
      ? {
          to: input.clientEmail,
          subject: `Reminder: upcoming visit from ${companyName}`,
          ...buildNotificationEmail(
            companyName,
            'Upcoming visit reminder',
            `<p>Hi ${escapeHtml(clientLabel)},</p><p>This is a reminder that <strong>${escapeHtml(input.jobTitle)}</strong> is scheduled for <strong>${escapeHtml(when)}</strong>.</p>`,
            { label: 'View your visits', href: portalUrl }
          ),
          text: `Reminder: ${input.jobTitle} is scheduled for ${when}. View: ${portalUrl}`,
        }
      : undefined,
    sms: input.clientPhone
      ? {
          phone: input.clientPhone,
          message: `${companyName}: Reminder — "${input.jobTitle}" on ${when}. ${portalUrl}`,
        }
      : undefined,
    metadata: {
      schedule_id: input.scheduleId,
      client_id: input.clientId,
      visit_day: input.visitDay,
    },
  })
}

export async function notifyClientInvoiceOverdueReminder(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string
    companyName?: string
    clientId: string
    clientEmail?: string | null
    clientPhone?: string | null
    clientName?: string | null
    jobTitle: string
    balanceDue: number
    daysOutstanding: number
    overdueOffset: number
    scheduleId: string
  }
) {
  const baseUrl = getAppBaseUrl()
  const portalUrl = `${baseUrl}/portal/documents`
  const companyName = input.companyName?.trim() || 'Your service company'
  const clientLabel = input.clientName?.trim() || 'there'
  const amount = `$${Number(input.balanceDue).toFixed(2)}`

  await dispatchNotification(supabaseAdmin, {
    companyId: input.companyId,
    event: 'invoice_overdue_reminder',
    email: input.clientEmail
      ? {
          to: input.clientEmail,
          subject: `Payment reminder: ${input.jobTitle}`,
          ...buildNotificationEmail(
            companyName,
            'Invoice payment reminder',
            `<p>Hi ${escapeHtml(clientLabel)},</p><p>Your invoice for <strong>${escapeHtml(input.jobTitle)}</strong> has an outstanding balance of <strong>${escapeHtml(amount)}</strong> (${input.overdueOffset} days past due).</p>`,
            { label: 'View invoice', href: portalUrl }
          ),
          text: `Payment reminder for ${input.jobTitle}: ${amount} is ${input.overdueOffset} days past due. View: ${portalUrl}`,
        }
      : undefined,
    sms: input.clientPhone
      ? {
          phone: input.clientPhone,
          message: `${companyName}: Invoice "${input.jobTitle}" — ${amount} due (${input.overdueOffset} days overdue). ${portalUrl}`,
        }
      : undefined,
    metadata: {
      schedule_id: input.scheduleId,
      client_id: input.clientId,
      overdue_offset: input.overdueOffset,
      days_outstanding: input.daysOutstanding,
    },
  })
}

export async function notifyStaffLeadFollowUpDue(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string
    companyName?: string
    leadId: string
    leadName: string
    followUpAt: string
    followUpDay?: string
    leadEmail?: string | null
    leadPhone?: string | null
  }
) {
  const staffEmails = await getStaffEmailsForCompany(supabaseAdmin, input.companyId)
  if (staffEmails.length === 0) return

  const baseUrl = getAppBaseUrl()
  const companyName = input.companyName?.trim() || 'Service Portal'
  const leadsUrl = `${baseUrl}/dashboard/leads`
  const when = new Date(input.followUpAt).toLocaleString()
  const contactBits = [
    input.leadEmail ? `Email: ${input.leadEmail}` : null,
    input.leadPhone ? `Phone: ${input.leadPhone}` : null,
  ].filter(Boolean)

  for (const email of staffEmails) {
    await dispatchNotification(supabaseAdmin, {
      companyId: input.companyId,
      event: 'lead_follow_up_due',
      email: {
        to: email,
        subject: `Follow-up due: ${input.leadName}`,
        ...buildNotificationEmail(
          companyName,
          'Lead follow-up reminder',
          `<p>Follow up with <strong>${escapeHtml(input.leadName)}</strong> is due <strong>${escapeHtml(when)}</strong>.</p>${contactBits.length ? `<p>${contactBits.map((line) => escapeHtml(line!)).join('<br/>')}</p>` : ''}`,
          { label: 'Open leads', href: leadsUrl }
        ),
        text: `Follow up with ${input.leadName} due ${when}. Open: ${leadsUrl}`,
      },
      metadata: {
        lead_id: input.leadId,
        follow_up_at: input.followUpAt,
        follow_up_day:
          input.followUpDay || new Date(input.followUpAt).toISOString().slice(0, 10),
      },
    })
  }
}

export async function queueNotification(
  supabaseAdmin: SupabaseClient,
  runner: (admin: SupabaseClient) => Promise<void>
) {
  try {
    await runner(supabaseAdmin)
  } catch (error) {
    console.error('queueNotification error:', error)
  }
}

export type { NotificationPreferences }
export { normalizeNotificationPreferences }