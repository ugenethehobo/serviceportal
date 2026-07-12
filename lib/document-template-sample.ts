import type { DocumentRenderData } from '@/lib/document-template-renderer'
import { getDocumentFieldPlaceholderLabel } from '@/lib/document-template-fields'

const PLACEHOLDER_LINE_ITEM = {
  description: 'Line Item Description',
  quantity: 1,
  unit_price: 0,
  amount: 0,
}

const PLACEHOLDER_PAYMENT = {
  payment_date: '2026-01-01T12:00:00.000Z',
  method: 'Payment Method',
  amount: 0,
}

export const SAMPLE_INVOICE_RENDER_DATA: Omit<DocumentRenderData, 'template'> = {
  kind: 'invoice',
  company: {
    name: getDocumentFieldPlaceholderLabel('company.name'),
    address: getDocumentFieldPlaceholderLabel('company.address'),
    phone: getDocumentFieldPlaceholderLabel('company.phone'),
  },
  client: {
    name: getDocumentFieldPlaceholderLabel('client.name'),
    contact_name: getDocumentFieldPlaceholderLabel('client.contact_name'),
    email: getDocumentFieldPlaceholderLabel('client.email'),
    phone: getDocumentFieldPlaceholderLabel('client.phone'),
    address: getDocumentFieldPlaceholderLabel('client.address'),
  },
  document: {
    title: getDocumentFieldPlaceholderLabel('document.title'),
    number: getDocumentFieldPlaceholderLabel('document.number'),
    date: getDocumentFieldPlaceholderLabel('document.date'),
  },
  job: {
    title: getDocumentFieldPlaceholderLabel('job.title'),
    visitDate: getDocumentFieldPlaceholderLabel('job.visit_date'),
  },
  lineItems: [PLACEHOLDER_LINE_ITEM, PLACEHOLDER_LINE_ITEM, PLACEHOLDER_LINE_ITEM],
  payments: [PLACEHOLDER_PAYMENT],
  summary: {
    totalCharged: 0,
    totalPaid: 0,
    balanceDue: 0,
  },
}

export const SAMPLE_ESTIMATE_RENDER_DATA: Omit<DocumentRenderData, 'template'> = {
  kind: 'estimate',
  company: {
    name: getDocumentFieldPlaceholderLabel('company.name'),
    address: getDocumentFieldPlaceholderLabel('company.address'),
    phone: getDocumentFieldPlaceholderLabel('company.phone'),
  },
  client: {
    name: getDocumentFieldPlaceholderLabel('client.name'),
    contact_name: getDocumentFieldPlaceholderLabel('client.contact_name'),
    email: getDocumentFieldPlaceholderLabel('client.email'),
    phone: getDocumentFieldPlaceholderLabel('client.phone'),
    address: getDocumentFieldPlaceholderLabel('client.address'),
  },
  document: {
    title: getDocumentFieldPlaceholderLabel('document.title'),
    number: getDocumentFieldPlaceholderLabel('document.number'),
    date: getDocumentFieldPlaceholderLabel('document.date'),
  },
  estimate: {
    title: getDocumentFieldPlaceholderLabel('estimate.title'),
    description: getDocumentFieldPlaceholderLabel('estimate.description'),
  },
  lineItems: [PLACEHOLDER_LINE_ITEM, PLACEHOLDER_LINE_ITEM],
  summary: {
    total: 0,
  },
}

export const SAMPLE_CONTRACT_RENDER_DATA: Omit<DocumentRenderData, 'template'> = {
  kind: 'contract',
  company: {
    name: getDocumentFieldPlaceholderLabel('company.name'),
    address: getDocumentFieldPlaceholderLabel('company.address'),
    phone: getDocumentFieldPlaceholderLabel('company.phone'),
  },
  client: {
    name: getDocumentFieldPlaceholderLabel('client.name'),
    contact_name: getDocumentFieldPlaceholderLabel('client.contact_name'),
    email: getDocumentFieldPlaceholderLabel('client.email'),
    phone: getDocumentFieldPlaceholderLabel('client.phone'),
    address: getDocumentFieldPlaceholderLabel('client.address'),
  },
  document: {
    title: 'Service Agreement',
    number: 'CTR-1001',
    date: getDocumentFieldPlaceholderLabel('document.date'),
  },
  job: {
    title: getDocumentFieldPlaceholderLabel('job.title'),
    visitDate: getDocumentFieldPlaceholderLabel('job.visit_date'),
  },
  contract: {
    serviceName: getDocumentFieldPlaceholderLabel('service.name'),
    signedDate: null,
  },
  fieldValues: {
    'input.notes': '',
  },
  lineItems: [],
  summary: {},
}