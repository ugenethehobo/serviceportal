import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  isCompanyStoragePath,
  loadContractStorageBytes,
  loadContractTemplateById,
} from '@/lib/contract-templates-server'
import { ContractError, renderContractPreview } from '@/lib/contracts-server'
import {
  normalizeDocumentTemplate,
  type DocumentKind,
  type DocumentTemplate,
} from '@/lib/document-template'
import {
  DocumentTemplateAccessError,
  verifyCompanyStaffForDocumentTemplates,
} from '@/lib/document-template-auth'
import { loadCompanyLogoBytesForPdf } from '@/lib/document-template-logo-server'
import { renderDocumentPdf } from '@/lib/document-template-renderer'
import {
  SAMPLE_CONTRACT_RENDER_DATA,
  SAMPLE_ESTIMATE_RENDER_DATA,
  SAMPLE_INVOICE_RENDER_DATA,
} from '@/lib/document-template-sample'

type PreviewRequestBody = {
  kind?: DocumentKind
  template?: DocumentTemplate
  /** Contract template being edited; its uploaded PDF (if any) is loaded server-side. */
  contractTemplateId?: string
  /** Contract draft being edited; rendered with the real client, job, and staff values. */
  contractId?: string
  fieldValues?: Record<string, string>
}

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function pdfResponse(bytes: Uint8Array, kind: DocumentKind) {
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'no-store',
      'Content-Disposition': `inline; filename="${kind}-template-preview.pdf"`,
    },
  })
}

function sanitizeFieldValues(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== 'object') return undefined
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .slice(0, 200)
      .map(([key, value]) => [key.slice(0, 120), String(value ?? '').slice(0, 2000)])
  )
}

export async function POST(request: Request) {
  try {
    const access = await verifyCompanyStaffForDocumentTemplates()

    const body = (await request.json()) as PreviewRequestBody
    const kind: DocumentKind =
      body.kind === 'estimate'
        ? 'estimate'
        : body.kind === 'contract'
          ? 'contract'
          : 'invoice'

    if (kind === 'contract' && body.contractId) {
      const bytes = await renderContractPreview(access.companyId, body.contractId, {
        template: body.template,
        fieldValues: sanitizeFieldValues(body.fieldValues),
      })
      return pdfResponse(bytes, kind)
    }

    let template = normalizeDocumentTemplate(body.template, kind)
    let basePdfBytes: Uint8Array | null = null

    if (kind === 'contract') {
      // Never trust a PDF path from the request: take it from the stored template.
      const stored = body.contractTemplateId
        ? await loadContractTemplateById(createSupabaseAdmin(), access.companyId, body.contractTemplateId)
        : null
      const background = stored?.template.background
      template = normalizeDocumentTemplate(
        {
          ...template,
          background,
          pages: background ? stored?.template.pages : template.pages,
        },
        'contract'
      )
      if (background && isCompanyStoragePath(access.companyId, background.storagePath)) {
        basePdfBytes = await loadContractStorageBytes(createSupabaseAdmin(), background.storagePath)
      }
    }

    const sampleData =
      kind === 'invoice'
        ? SAMPLE_INVOICE_RENDER_DATA
        : kind === 'contract'
          ? SAMPLE_CONTRACT_RENDER_DATA
          : SAMPLE_ESTIMATE_RENDER_DATA

    const logoBytes = await loadCompanyLogoBytesForPdf(access.companyId)

    const pdfBytes = await renderDocumentPdf({
      ...sampleData,
      template,
      basePdfBytes,
      showStaffPlaceholders: kind === 'contract',
      company: {
        ...sampleData.company,
        logoBytes,
      },
    })

    return pdfResponse(pdfBytes, kind)
  } catch (error: unknown) {
    if (error instanceof DocumentTemplateAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof ContractError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    const message = error instanceof Error ? error.message : 'Could not render template preview'
    console.error('document template preview error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
