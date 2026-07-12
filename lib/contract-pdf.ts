import type { DocumentTemplate } from '@/lib/document-template'
import { renderDocumentPdf } from '@/lib/document-template-renderer'

export type ContractPdfData = {
  contract: {
    number: string
    issuedAt: string
    title: string
    serviceName: string | null
    signedDate: string | null
    jobTitle: string
    visitDate: string | null
  }
  company: {
    name: string
    address?: string | null
    phone?: string | null
    logoBytes?: Uint8Array | null
  }
  client: {
    name: string
    contact_name?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
  }
  template: DocumentTemplate
  fieldValues?: Record<string, string>
  signatures?: {
    client?: Uint8Array | null
    clientInitials?: Uint8Array | null
  }
}

export async function generateContractPdf(data: ContractPdfData): Promise<Uint8Array> {
  const issuedDate = new Date(data.contract.issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return renderDocumentPdf({
    kind: 'contract',
    template: data.template,
    company: data.company,
    client: data.client,
    document: {
      title: data.contract.title || 'Service Agreement',
      number: data.contract.number,
      date: issuedDate,
    },
    job: {
      title: data.contract.jobTitle,
      visitDate: data.contract.visitDate,
    },
    contract: {
      serviceName: data.contract.serviceName,
      signedDate: data.contract.signedDate,
    },
    fieldValues: data.fieldValues,
    signatures: data.signatures,
    lineItems: [],
    summary: {},
  })
}