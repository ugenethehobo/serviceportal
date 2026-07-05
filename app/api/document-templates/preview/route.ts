import { NextResponse } from 'next/server'
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
  SAMPLE_ESTIMATE_RENDER_DATA,
  SAMPLE_INVOICE_RENDER_DATA,
} from '@/lib/document-template-sample'

type PreviewRequestBody = {
  kind?: DocumentKind
  template?: DocumentTemplate
}

export async function POST(request: Request) {
  try {
    const access = await verifyCompanyStaffForDocumentTemplates()

    const body = (await request.json()) as PreviewRequestBody
    const kind: DocumentKind = body.kind === 'estimate' ? 'estimate' : 'invoice'
    const template = normalizeDocumentTemplate(body.template, kind)

    const sampleData =
      kind === 'invoice' ? SAMPLE_INVOICE_RENDER_DATA : SAMPLE_ESTIMATE_RENDER_DATA

    const logoBytes = await loadCompanyLogoBytesForPdf(access.companyId)

    const pdfBytes = await renderDocumentPdf({
      ...sampleData,
      template,
      company: {
        ...sampleData.company,
        logoBytes,
      },
    })

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="${kind}-template-preview.pdf"`,
      },
    })
  } catch (error: unknown) {
    if (error instanceof DocumentTemplateAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    const message = error instanceof Error ? error.message : 'Could not render template preview'
    console.error('document template preview error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}