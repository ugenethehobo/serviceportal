import {
  migrateInvoiceTemplateToDocumentTemplate,
  type DocumentTemplate,
} from '@/lib/document-template'
import { renderDocumentPdf } from '@/lib/document-template-renderer'
import type { InvoiceTemplate } from '@/lib/invoice-template'

interface InvoicePaymentRow {
  payment_date: string
  method: string
  amount: number
}

interface InvoiceInstallmentRow {
  label: string
  amountDue: number
  amountPaid: number
  remaining: number
  statusLabel: string
  dueDate: string | null
}

interface InvoicePdfData {
  invoice: {
    number: string
    issuedAt: string
    jobTitle: string
    visitDate: string | null
    status: string
  }
  lineItems: Array<{
    description: string
    quantity: number
    unit_price: number
    amount: number
  }>
  payments: InvoicePaymentRow[]
  /** Non-default payment plan schedule; omitted or empty skips the PDF section. */
  installments?: InvoiceInstallmentRow[]
  summary: {
    totalCharged: number
    totalPaid: number
    balanceDue: number
  }
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
  template: InvoiceTemplate | DocumentTemplate
}

function isDocumentTemplate(
  template: InvoiceTemplate | DocumentTemplate
): template is DocumentTemplate {
  return 'version' in template && template.version === 2
}

function resolveInvoiceDocumentTemplate(
  template: InvoiceTemplate | DocumentTemplate
): DocumentTemplate {
  if (isDocumentTemplate(template)) {
    return template
  }
  return migrateInvoiceTemplateToDocumentTemplate(template)
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const issuedDate = new Date(data.invoice.issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return renderDocumentPdf({
    kind: 'invoice',
    template: resolveInvoiceDocumentTemplate(data.template),
    company: data.company,
    client: data.client,
    document: {
      title: 'INVOICE',
      number: data.invoice.number,
      date: issuedDate,
    },
    job: {
      title: data.invoice.jobTitle,
      visitDate: data.invoice.visitDate,
    },
    lineItems: data.lineItems,
    payments: data.payments,
    installments: data.installments,
    summary: data.summary,
  })
}