import { normalizeDocumentTemplate, type DocumentTemplate } from '@/lib/document-template'
import { renderDocumentPdf } from '@/lib/document-template-renderer'
import { formatEstimateNumber } from '@/lib/estimates'

interface EstimatePdfData {
  estimate: {
    id: string
    title: string
    description: string | null
    status: string
    total: number
    created_at: string
  }
  lineItems: Array<{
    description: string
    quantity: number
    unit_price: number
    amount: number
  }>
  company: {
    name: string
    address?: string | null
    phone?: string | null
    logoBytes?: Uint8Array | null
    logoUrl?: string | null
  }
  client: {
    name: string
    contact_name?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
  }
  template?: DocumentTemplate
}

export async function generateEstimatePdf(data: EstimatePdfData): Promise<Uint8Array> {
  const estimateNumber = formatEstimateNumber(data.estimate.id, data.estimate.created_at)
  const createdDate = new Date(data.estimate.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const template =
    data.template || normalizeDocumentTemplate(null, 'estimate')

  return renderDocumentPdf({
    kind: 'estimate',
    template,
    company: data.company,
    client: data.client,
    document: {
      title: 'ESTIMATE',
      number: estimateNumber,
      date: createdDate,
    },
    estimate: {
      title: data.estimate.title,
      description: data.estimate.description,
    },
    lineItems: data.lineItems,
    summary: {
      total: data.estimate.total,
    },
  })
}