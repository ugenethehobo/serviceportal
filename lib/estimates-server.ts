import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { generateEstimatePdf } from '@/lib/estimate-pdf'
import { calcEstimateTotal, formatEstimateNumber, resolveAutoEstimateStatus, type EstimateStatus } from '@/lib/estimates'
import { calcLineAmount } from '@/lib/billing'
import {
  notifyClientEstimateSent,
  queueNotification,
} from '@/lib/notifications-server'

const BUCKET = 'client-documents'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function applyAutoEstimateStatus(
  supabaseAdmin: SupabaseClient,
  estimateId: string
) {
  const { data: estimate } = await supabaseAdmin
    .from('estimates')
    .select('status')
    .eq('id', estimateId)
    .single()

  const { count } = await supabaseAdmin
    .from('estimate_line_items')
    .select('id', { count: 'exact', head: true })
    .eq('estimate_id', estimateId)

  const newStatus = resolveAutoEstimateStatus(
    (estimate?.status as EstimateStatus) || 'draft',
    count || 0
  )

  const previousStatus = estimate?.status

  if (newStatus !== previousStatus) {
    await supabaseAdmin
      .from('estimates')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', estimateId)

    if (newStatus === 'sent' && previousStatus !== 'sent') {
      void queueNotification(supabaseAdmin, async (admin) => {
        await maybeNotifyEstimateSent(admin, estimateId)
      })
    }
  }

  return newStatus
}

async function maybeNotifyEstimateSent(
  supabaseAdmin: SupabaseClient,
  estimateId: string
) {
  const { data: estimate } = await supabaseAdmin
    .from('estimates')
    .select(`
      id,
      title,
      total,
      company_id,
      client:clients!client_id (name, email, phone, portal_enabled),
      company:companies!company_id (name)
    `)
    .eq('id', estimateId)
    .single()

  if (!estimate) return

  const client = Array.isArray((estimate as any).client)
    ? (estimate as any).client[0]
    : (estimate as any).client
  const company = Array.isArray((estimate as any).company)
    ? (estimate as any).company[0]
    : (estimate as any).company

  if (!client?.email && !client?.phone) return

  await notifyClientEstimateSent(supabaseAdmin, {
    companyId: estimate.company_id,
    companyName: company?.name,
    clientEmail: client?.email,
    clientPhone: client?.phone,
    clientName: client?.name,
    estimateTitle: estimate.title,
    estimateTotal: Number(estimate.total),
    estimateId: estimate.id,
  })
}

export async function notifyEstimateSentById(estimateId: string) {
  const supabaseAdmin = createSupabaseAdmin()
  await queueNotification(supabaseAdmin, async (admin) => {
    await maybeNotifyEstimateSent(admin, estimateId)
  })
}

export async function recalcEstimateTotal(
  supabaseAdmin: SupabaseClient,
  estimateId: string
) {
  const { data: items } = await supabaseAdmin
    .from('estimate_line_items')
    .select('amount')
    .eq('estimate_id', estimateId)

  const total = calcEstimateTotal(items || [])

  await supabaseAdmin
    .from('estimates')
    .update({ total, updated_at: new Date().toISOString() })
    .eq('id', estimateId)

  return total
}

export async function syncEstimateDocument(estimateId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: estimate, error } = await supabaseAdmin
    .from('estimates')
    .select(`
      *,
      client:clients!client_id (name, contact_name, email, phone, address),
      company:companies!company_id (name)
    `)
    .eq('id', estimateId)
    .single()

  if (error || !estimate) throw new Error('Estimate not found')

  const { data: lineItems } = await supabaseAdmin
    .from('estimate_line_items')
    .select('description, quantity, unit_price, amount')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: true })

  const client = Array.isArray((estimate as any).client)
    ? (estimate as any).client[0]
    : (estimate as any).client
  const company = Array.isArray((estimate as any).company)
    ? (estimate as any).company[0]
    : (estimate as any).company

  const pdfBytes = await generateEstimatePdf({
    estimate: {
      id: estimate.id,
      title: estimate.title,
      description: estimate.description,
      status: estimate.status,
      total: estimate.total,
      created_at: estimate.created_at,
    },
    lineItems: lineItems || [],
    company: { name: company?.name || 'Company' },
    client: client || { name: 'Client' },
  })

  const estimateNumber = formatEstimateNumber(estimate.id, estimate.created_at)
  const storagePath = `${estimate.company_id}/${estimate.client_id}/estimates/${estimate.id}.pdf`
  const fileName = `${estimateNumber}.pdf`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) throw uploadError

  const { data: existingDoc } = await supabaseAdmin
    .from('client_documents')
    .select('id')
    .eq('estimate_id', estimateId)
    .maybeSingle()

  if (existingDoc) {
    await supabaseAdmin
      .from('client_documents')
      .update({
        name: fileName,
        storage_path: storagePath,
        file_type: 'application/pdf',
      })
      .eq('id', existingDoc.id)
  } else {
    await supabaseAdmin.from('client_documents').insert({
      client_id: estimate.client_id,
      company_id: estimate.company_id,
      estimate_id: estimateId,
      name: fileName,
      storage_path: storagePath,
      file_type: 'application/pdf',
      source: 'estimate',
    })
  }

  return { storagePath, fileName }
}

export async function seedBillingFromEstimate(
  supabaseAdmin: SupabaseClient,
  scheduleId: string,
  clientId: string,
  companyId: string,
  estimateId: string,
  fallbackTitle: string,
  fallbackTotal: number
) {
  const { data: items } = await supabaseAdmin
    .from('estimate_line_items')
    .select('description, quantity, unit_price, amount')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: true })

  if (items && items.length > 0) {
    await supabaseAdmin.from('billing_line_items').insert(
      items.map((item) => ({
        schedule_id: scheduleId,
        client_id: clientId,
        company_id: companyId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        amount: item.amount,
      }))
    )
    return
  }

  if (fallbackTotal > 0) {
    const amount = calcLineAmount(1, fallbackTotal)
    await supabaseAdmin.from('billing_line_items').insert({
      schedule_id: scheduleId,
      client_id: clientId,
      company_id: companyId,
      description: fallbackTitle,
      quantity: 1,
      unit_price: fallbackTotal,
      amount,
    })
  }
}

export async function getDocumentSignedUrl(storagePath: string, expiresIn = 3600) {
  const supabaseAdmin = createSupabaseAdmin()
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn)

  if (error) throw error
  return data.signedUrl
}