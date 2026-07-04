import type { SupabaseClient } from '@supabase/supabase-js'
import type { MessagingMessage, MessagingSenderRole, MessagingThread } from '@/lib/messaging'

export async function getOrCreateMessagingThread(
  admin: SupabaseClient,
  input: {
    companyId: string
    clientId: string
    scheduleId?: string | null
  }
): Promise<MessagingThread> {
  const scheduleId = input.scheduleId ?? null

  let query = admin
    .from('message_threads')
    .select('*')
    .eq('client_id', input.clientId)
    .eq('company_id', input.companyId)

  if (scheduleId) {
    query = query.eq('schedule_id', scheduleId)
  } else {
    query = query.is('schedule_id', null)
  }

  const { data: existing, error: existingError } = await query.maybeSingle()

  if (existingError && existingError.code !== '42P01') {
    throw existingError
  }

  if (existing) {
    return existing as MessagingThread
  }

  const { data: created, error: createError } = await admin
    .from('message_threads')
    .insert({
      company_id: input.companyId,
      client_id: input.clientId,
      schedule_id: scheduleId,
    })
    .select('*')
    .single()

  if (createError) throw createError
  return created as MessagingThread
}

export async function listMessagingMessages(
  admin: SupabaseClient,
  threadId: string
): Promise<MessagingMessage[]> {
  const { data, error } = await admin
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (error) {
    if (error.code === '42P01') return []
    throw error
  }

  return (data || []) as MessagingMessage[]
}

export async function insertMessagingMessage(
  admin: SupabaseClient,
  input: {
    threadId: string
    companyId: string
    senderUserId: string
    senderRole: MessagingSenderRole
    senderName: string | null
    body: string
  }
): Promise<MessagingMessage> {
  const { data, error } = await admin
    .from('messages')
    .insert({
      thread_id: input.threadId,
      company_id: input.companyId,
      sender_user_id: input.senderUserId,
      sender_role: input.senderRole,
      sender_name: input.senderName,
      body: input.body,
    })
    .select('*')
    .single()

  if (error) throw error

  await admin
    .from('message_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.threadId)

  return data as MessagingMessage
}

export async function resolveStaffMessageSenderName(
  admin: SupabaseClient,
  input: {
    companyId: string
    clientId: string
    profile: { full_name: string | null; email: string | null }
  }
) {
  const [{ data: company }, { data: client }] = await Promise.all([
    admin.from('companies').select('name').eq('id', input.companyId).single(),
    admin.from('clients').select('name').eq('id', input.clientId).single(),
  ])

  const companyName = company?.name?.trim() || null
  const clientName = client?.name?.trim() || null
  const staffName =
    input.profile.full_name?.trim() || input.profile.email?.trim() || null

  if (
    staffName &&
    clientName &&
    staffName.localeCompare(clientName, undefined, { sensitivity: 'accent' }) === 0
  ) {
    return companyName || staffName
  }

  if (staffName) return staffName
  return companyName || 'Your team'
}

export async function verifyScheduleBelongsToClient(
  admin: SupabaseClient,
  scheduleId: string,
  clientId: string
) {
  const { data, error } = await admin
    .from('schedules')
    .select('id')
    .eq('id', scheduleId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) throw error
  return !!data
}