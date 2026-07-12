import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  runInvoiceOverdueReminderCron,
  runVisitReminderCron,
} from '@/lib/notification-reminders-cron'
import { notifyStaffLeadFollowUpDue, queueNotification } from '@/lib/notifications-server'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createSupabaseAdmin()
  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('id, company_id, name, email, phone, follow_up_at, status')
    .not('follow_up_at', 'is', null)
    .lte('follow_up_at', endOfDay.toISOString())
    .not('status', 'in', '("archived","won","lost")')

  if (error) {
    console.error('lead follow-up cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let leadSent = 0
  let leadSkipped = 0

  for (const lead of leads || []) {
    const followUpAt = lead.follow_up_at
    if (!followUpAt) continue

    const followUpDate = new Date(followUpAt)
    const dayKey = followUpDate.toISOString().slice(0, 10)
    const { data: existing } = await supabaseAdmin
      .from('notification_log')
      .select('id')
      .eq('company_id', lead.company_id)
      .eq('event_type', 'lead_follow_up_due')
      .filter('metadata->>lead_id', 'eq', lead.id)
      .filter('metadata->>follow_up_day', 'eq', dayKey)
      .limit(1)
      .maybeSingle()

    if (existing) {
      leadSkipped += 1
      continue
    }

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name')
      .eq('id', lead.company_id)
      .single()

    await queueNotification(supabaseAdmin, async (admin) => {
      await notifyStaffLeadFollowUpDue(admin, {
        companyId: lead.company_id,
        companyName: company?.name,
        leadId: lead.id,
        leadName: lead.name,
        followUpAt,
        leadEmail: lead.email,
        leadPhone: lead.phone,
        followUpDay: dayKey,
      })
    })

    leadSent += 1
  }

  const [scheduleStatusSync, visitReminders, invoiceReminders] = await Promise.all([
    import('@/lib/schedule-status-sync').then((module) =>
      module.syncAllCompaniesScheduleStatuses(supabaseAdmin)
    ),
    runVisitReminderCron(supabaseAdmin, now),
    runInvoiceOverdueReminderCron(supabaseAdmin, now),
  ])

  return NextResponse.json({
    ok: true,
    lead_follow_up: {
      checked: leads?.length || 0,
      sent: leadSent,
      skipped: leadSkipped,
    },
    schedule_status_sync: scheduleStatusSync,
    visit_reminders: visitReminders,
    invoice_overdue_reminders: invoiceReminders,
  })
}