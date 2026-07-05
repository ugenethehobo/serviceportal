import type { SupabaseClient } from '@supabase/supabase-js'
import {
  documentTemplateToInvoiceTemplate,
  normalizeCompanyDocumentTemplates,
  normalizeDocumentTemplate,
  resolveCompanyDocumentTemplates,
  type CompanyDocumentTemplates,
  type DocumentKind,
  type DocumentTemplate,
} from '@/lib/document-template'
import { normalizeInvoiceTemplate } from '@/lib/invoice-template'

export async function loadCompanyDocumentTemplates(
  supabaseAdmin: SupabaseClient,
  companyId: string
): Promise<CompanyDocumentTemplates> {
  const full = await supabaseAdmin
    .from('companies')
    .select('document_templates, invoice_template')
    .eq('id', companyId)
    .single()

  if (!full.error) {
    return resolveCompanyDocumentTemplates(
      full.data?.document_templates,
      full.data?.invoice_template
    )
  }

  if (full.error.code !== '42703') {
    throw full.error
  }

  const legacy = await supabaseAdmin
    .from('companies')
    .select('invoice_template')
    .eq('id', companyId)
    .single()

  if (!legacy.error) {
    return resolveCompanyDocumentTemplates(null, legacy.data?.invoice_template)
  }

  if (legacy.error.code === '42703') {
    return resolveCompanyDocumentTemplates(null, null)
  }

  throw legacy.error
}

export async function loadCompanyDocumentTemplate(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  kind: DocumentKind
): Promise<DocumentTemplate> {
  const templates = await loadCompanyDocumentTemplates(supabaseAdmin, companyId)
  return templates[kind]
}

export function buildDocumentTemplatesPayload(
  current: CompanyDocumentTemplates,
  kind: DocumentKind,
  template: DocumentTemplate
): CompanyDocumentTemplates {
  return normalizeCompanyDocumentTemplates({
    ...current,
    [kind]: normalizeDocumentTemplate(template, kind),
  })
}

export function buildLegacyInvoiceTemplatePayload(template: DocumentTemplate) {
  return normalizeInvoiceTemplate(documentTemplateToInvoiceTemplate(template))
}