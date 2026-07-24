import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getDisplayAddressFromClient } from '@/lib/address'
import { SYSTEM_DOCUMENT_CATEGORY_INVOICES } from '@/lib/document-categories'
import { calcBillingSummary } from '@/lib/billing'
import type { DocumentTemplate } from '@/lib/document-template'
import { loadCompanyDocumentTemplate } from '@/lib/document-template-storage'
import { generateInvoicePdf } from '@/lib/invoice-pdf'
import { formatInvoiceNumber } from '@/lib/invoices'

const BUCKET = 'client-documents'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function loadInvoiceDocumentTemplate(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<DocumentTemplate> {
  return loadCompanyDocumentTemplate(supabaseAdmin, companyId, 'invoice')
}

async function findExistingInvoiceDocument(
  supabaseAdmin: SupabaseClient,
  scheduleId: string
) {
  const { data: invoiceDoc } = await supabaseAdmin
    .from('client_documents')
    .select('id, storage_path, source, name, created_at')
    .eq('schedule_id', scheduleId)
    .eq('source', 'invoice')
    .maybeSingle()

  if (invoiceDoc) return invoiceDoc

  const { data: legacyDoc } = await supabaseAdmin
    .from('client_documents')
    .select('id, storage_path, source, name, created_at')
    .eq('schedule_id', scheduleId)
    .eq('source', 'upload')
    .eq('category', SYSTEM_DOCUMENT_CATEGORY_INVOICES)
    .maybeSingle()

  return legacyDoc
}

function parseInvoiceNumberFromFileName(fileName: string | null | undefined): string | null {
  if (!fileName) return null
  const base = fileName.replace(/\.pdf$/i, '')
  return base.startsWith('INV-') ? base : null
}

function resolveStableInvoiceMeta(
  scheduleId: string,
  existingDoc: { name?: string | null; created_at?: string | null } | null
) {
  const issuedAt = existingDoc?.created_at || new Date().toISOString()
  const invoiceNumber =
    parseInvoiceNumberFromFileName(existingDoc?.name) ||
    formatInvoiceNumber(scheduleId, issuedAt)
  return { issuedAt, invoiceNumber }
}

async function removeInvoiceDocument(
  supabaseAdmin: SupabaseClient,
  document: { id: string; storage_path: string }
) {
  await supabaseAdmin.storage.from(BUCKET).remove([document.storage_path])
  await supabaseAdmin.from('client_documents').delete().eq('id', document.id)
}

async function upsertInvoiceDocumentRow(
  supabaseAdmin: SupabaseClient,
  input: {
    scheduleId: string
    clientId: string
    companyId: string
    fileName: string
    storagePath: string
    existingDoc: { id: string; storage_path: string; source: string } | null
  }
) {
  const row = {
    name: input.fileName,
    storage_path: input.storagePath,
    file_type: 'application/pdf',
    category: SYSTEM_DOCUMENT_CATEGORY_INVOICES,
    schedule_id: input.scheduleId,
  }

  if (input.existingDoc) {
    const { error } = await supabaseAdmin
      .from('client_documents')
      .update(row)
      .eq('id', input.existingDoc.id)

    if (error) throw error
    return {
      documentId: input.existingDoc.id,
      fileName: input.fileName,
      storagePath: input.storagePath,
    }
  }

  const { data: inserted, error: invoiceInsertError } = await supabaseAdmin
    .from('client_documents')
    .insert({
      client_id: input.clientId,
      company_id: input.companyId,
      ...row,
      source: 'invoice',
    })
    .select('id')
    .single()

  if (!invoiceInsertError && inserted) {
    return { documentId: inserted.id, fileName: input.fileName, storagePath: input.storagePath }
  }

  if (invoiceInsertError?.code !== '23514') {
    throw new Error(
      invoiceInsertError?.message ||
        'Could not save invoice document. Run supabase/invoices-schema.sql in Supabase.'
    )
  }

  const { data: fallbackInserted, error: fallbackError } = await supabaseAdmin
    .from('client_documents')
    .insert({
      client_id: input.clientId,
      company_id: input.companyId,
      ...row,
      source: 'upload',
    })
    .select('id')
    .single()

  if (fallbackError) {
    throw new Error(
      fallbackError.message ||
        'Could not save invoice document. Run supabase/invoices-schema.sql in Supabase.'
    )
  }

  return {
    documentId: fallbackInserted.id,
    fileName: input.fileName,
    storagePath: input.storagePath,
  }
}

function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export async function syncJobInvoiceDocument(scheduleId: string) {
  const supabaseAdmin = createSupabaseAdmin()

  const { data: schedule, error } = await supabaseAdmin
    .from('schedules')
    .select(`
      id,
      title,
      status,
      start_time,
      client_id,
      client:clients!client_id (
        name,
        contact_name,
        email,
        phone,
        address,
        address_street,
        address_unit,
        address_city,
        address_state,
        address_zip,
        company_id,
        company:companies!company_id (name, address, phone)
      )
    `)
    .eq('id', scheduleId)
    .single()

  if (error || !schedule) {
    console.error('syncJobInvoiceDocument schedule lookup error:', error)
    throw new Error(error?.message || 'Job not found')
  }

  const client = unwrapJoin(
    (schedule as { client?: Record<string, unknown> | Record<string, unknown>[] }).client
  ) as Record<string, unknown> | null
  const company = unwrapJoin(
    client?.company as Record<string, unknown> | Record<string, unknown>[] | undefined
  ) as Record<string, unknown> | null
  const companyId = typeof client?.company_id === 'string' ? client.company_id : null

  if (!companyId) {
    throw new Error('Could not resolve company for this job')
  }

  const existingDoc = await findExistingInvoiceDocument(supabaseAdmin, scheduleId)

  const { data: lineItems } = await supabaseAdmin
    .from('billing_line_items')
    .select('description, quantity, unit_price, amount')
    .eq('schedule_id', scheduleId)
    .order('created_at', { ascending: true })

  if (!lineItems || lineItems.length === 0) {
    if (existingDoc) {
      await removeInvoiceDocument(supabaseAdmin, existingDoc)
    }
    return null
  }

  const { data: payments } = await supabaseAdmin
    .from('billing_payments')
    .select('payment_date, method, amount')
    .eq('schedule_id', scheduleId)
    .order('payment_date', { ascending: true })

  const summary = calcBillingSummary(lineItems, payments || [])

  const template = await loadInvoiceDocumentTemplate(supabaseAdmin, companyId)

  const { issuedAt, invoiceNumber } = resolveStableInvoiceMeta(schedule.id, existingDoc)
  const visitDate = schedule.start_time
    ? new Date(schedule.start_time).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  let installments:
    | Array<{
        label: string
        amountDue: number
        amountPaid: number
        remaining: number
        statusLabel: string
        dueDate: string | null
      }>
    | undefined

  try {
    const {
      shouldShowInvoiceInstallmentSchedule,
      toInvoiceInstallmentRows,
    } = await import('@/lib/payment-plans')
    const { loadJobPaymentPlanProgress } = await import('@/lib/payment-plans-server')
    const plan = await loadJobPaymentPlanProgress(supabaseAdmin, scheduleId, {
      status: String(schedule.status || ''),
      startTime: schedule.start_time ? String(schedule.start_time) : new Date().toISOString(),
    })
    if (shouldShowInvoiceInstallmentSchedule(plan)) {
      installments = toInvoiceInstallmentRows(plan)
    }
  } catch (error) {
    console.error('syncJobInvoiceDocument payment plan load error:', error)
  }

  const { loadCompanyLogoBytesForPdf } = await import('@/lib/document-template-logo-server')
  const logoBytes = await loadCompanyLogoBytesForPdf(companyId)

  const pdfBytes = await generateInvoicePdf({
    invoice: {
      number: invoiceNumber,
      issuedAt,
      jobTitle: schedule.title,
      visitDate,
      status: schedule.status,
    },
    lineItems,
    payments: payments || [],
    installments,
    summary,
    company: {
      name: (company as { name?: string })?.name || 'Company',
      address: (company as { address?: string })?.address || null,
      phone: (company as { phone?: string })?.phone || null,
      logoBytes,
    },
    client: {
      name: (client as { name?: string })?.name || 'Client',
      contact_name: (client as { contact_name?: string })?.contact_name,
      email: (client as { email?: string })?.email,
      phone: (client as { phone?: string })?.phone,
      address: client ? getDisplayAddressFromClient(client as Parameters<typeof getDisplayAddressFromClient>[0]) : null,
    },
    template,
  })

  const storagePath = `${companyId}/${schedule.client_id}/invoices/${schedule.id}.pdf`
  const fileName = `${invoiceNumber}.pdf`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    throw new Error(uploadError.message || 'Could not upload invoice PDF to storage')
  }

  return upsertInvoiceDocumentRow(supabaseAdmin, {
    scheduleId,
    clientId: schedule.client_id,
    companyId,
    fileName,
    storagePath,
    existingDoc,
  })
}