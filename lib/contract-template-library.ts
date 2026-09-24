import {
  DEFAULT_BRAND_COLORS,
  DEFAULT_CONTRACT_DOCUMENT_TEMPLATE,
  DOCUMENT_PAGE,
  normalizeDocumentTemplate,
  type DocumentElement,
  type DocumentTemplate,
} from '@/lib/document-template'

/**
 * Built-in starter contracts. They are ordinary builder templates: staff pick one, it is
 * copied into their library, and from then on it is theirs to edit.
 */

export type ContractStarterId =
  | 'service-agreement'
  | 'maintenance-agreement'
  | 'work-authorization'
  | 'liability-waiver'
  | 'simple-agreement'
  | 'blank'

export type ContractStarter = {
  id: ContractStarterId
  name: string
  description: string
  build: () => DocumentTemplate
}

export const CONTRACT_STARTER_DISCLAIMER =
  'Starter templates are general examples, not legal advice. Have your attorney review contract language before using it with clients.'

const MARGIN = 50
const CONTENT_WIDTH = DOCUMENT_PAGE.width - MARGIN * 2
const PAGE_BOTTOM = DOCUMENT_PAGE.height - MARGIN
const BLOCK_GAP = 10
/** Deliberately wider than Helvetica's real average so estimates never under-size a block. */
const ESTIMATED_CHAR_WIDTH_EM = 0.54
const LINE_HEIGHT = 1.4

/** Merge tags expand to real names and addresses; budget for long values. */
const MERGE_TAG_BUDGET = 'x'.repeat(40)
const MERGE_TAG_RE = /\{\{[^}]+\}\}/g
const HAS_MERGE_TAG_RE = /\{\{[^}]+\}\}/

export function estimateTextBlockHeight(text: string, fontSize: number, width: number): number {
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * ESTIMATED_CHAR_WIDTH_EM)))
  const hasTags = HAS_MERGE_TAG_RE.test(text)
  const expanded = text.replace(MERGE_TAG_RE, MERGE_TAG_BUDGET)
  const lines = expanded
    .split('\n')
    .reduce((total, paragraph) => total + Math.max(1, Math.ceil(paragraph.length / charsPerLine)), 0)
  return Math.ceil((lines + (hasTags ? 1 : 0)) * fontSize * LINE_HEIGHT)
}

class ContractLayout {
  private page = 0
  private y = MARGIN
  readonly elements: DocumentElement[] = []

  private place(element: Omit<DocumentElement, 'page' | 'y' | 'visible' | 'layout'>, height: number) {
    if (this.y + height > PAGE_BOTTOM && this.y > MARGIN) {
      this.page += 1
      this.y = MARGIN
    }
    this.elements.push({
      ...element,
      y: this.y,
      page: this.page > 0 ? this.page : undefined,
      visible: true,
      layout: 'absolute',
    })
    this.y += height + BLOCK_GAP
  }

  /** Reserves vertical space so the next group stays together on one page. */
  keepTogether(height: number) {
    if (this.y + height > PAGE_BOTTOM && this.y > MARGIN) {
      this.page += 1
      this.y = MARGIN
    }
  }

  space(height: number) {
    this.y += height
  }

  header(title: string) {
    this.elements.push(
      {
        id: 'company-logo',
        kind: 'image',
        fieldKey: 'company.logo',
        x: DOCUMENT_PAGE.width - MARGIN - 110,
        y: MARGIN,
        width: 110,
        height: 52,
        visible: true,
        layout: 'absolute',
      },
      {
        id: 'company-name',
        kind: 'field',
        fieldKey: 'company.name',
        appearance: 'overlay',
        x: MARGIN,
        y: MARGIN,
        width: 300,
        fontSize: 18,
        fontWeight: 'bold',
        visible: true,
        layout: 'absolute',
      },
      {
        id: 'company-address',
        kind: 'field',
        fieldKey: 'company.address',
        appearance: 'overlay',
        x: MARGIN,
        y: MARGIN + 26,
        width: 300,
        fontSize: 9,
        color: DEFAULT_BRAND_COLORS.muted,
        visible: true,
        layout: 'absolute',
      },
      {
        id: 'company-phone',
        kind: 'field',
        fieldKey: 'company.phone',
        appearance: 'overlay',
        x: MARGIN,
        y: MARGIN + 40,
        width: 300,
        fontSize: 9,
        color: DEFAULT_BRAND_COLORS.muted,
        visible: true,
        layout: 'absolute',
      },
      {
        id: 'header-rule',
        kind: 'line',
        x: MARGIN,
        y: MARGIN + 64,
        width: CONTENT_WIDTH,
        visible: true,
        layout: 'absolute',
      }
    )
    this.y = MARGIN + 78
    const titleY = this.y
    this.text('doc-title', title, { fontSize: 16, bold: true, width: CONTENT_WIDTH - 230 })
    this.elements.push({
      id: 'doc-number',
      kind: 'field',
      fieldKey: 'document.number',
      x: DOCUMENT_PAGE.width - MARGIN - 220,
      y: titleY + 4,
      width: 220,
      align: 'right',
      fontSize: 9,
      color: DEFAULT_BRAND_COLORS.muted,
      visible: true,
      layout: 'absolute',
    })
  }

  text(
    id: string,
    text: string,
    options: { fontSize?: number; bold?: boolean; color?: string; width?: number } = {}
  ) {
    const fontSize = options.fontSize ?? 9.5
    const width = options.width ?? CONTENT_WIDTH
    this.place(
      {
        id,
        kind: 'text',
        text,
        x: MARGIN,
        width,
        height: estimateTextBlockHeight(text, fontSize, width),
        fontSize,
        fontWeight: options.bold ? 'bold' : 'normal',
        color: options.color,
      },
      estimateTextBlockHeight(text, fontSize, width)
    )
  }

  heading(id: string, text: string) {
    this.keepTogether(60)
    this.text(id, text, { fontSize: 11, bold: true })
  }

  staffField(id: string, label: string, height = 40, required = true) {
    this.place(
      {
        id,
        kind: 'input',
        fieldKey: `staff.${id}`,
        filledBy: 'staff',
        required: required ? undefined : false,
        label,
        x: MARGIN,
        width: CONTENT_WIDTH,
        height,
        fontSize: 10,
      },
      height
    )
  }

  checkbox(id: string, label: string) {
    const height = estimateTextBlockHeight(label, 10, CONTENT_WIDTH - 24) + 4
    this.place(
      {
        id,
        kind: 'checkbox',
        fieldKey: `check.${id}`,
        label,
        x: MARGIN,
        width: CONTENT_WIDTH,
        height,
        fontSize: 10,
      },
      height
    )
  }

  signatureBlock(options: { initials?: boolean } = {}) {
    this.keepTogether(170)
    this.text('sign-intro', 'By signing below, the Client agrees to the terms of this agreement.', {
      fontSize: 9.5,
    })
    const top = this.y + 6
    const page = this.page > 0 ? this.page : undefined
    this.elements.push(
      {
        id: 'client-signature',
        kind: 'signature',
        fieldKey: 'sign.client',
        page,
        label: 'Client signature',
        x: MARGIN,
        y: top,
        width: 260,
        height: 64,
        fontSize: 10,
        visible: true,
        layout: 'absolute',
      },
      {
        id: 'signed-name',
        kind: 'field',
        fieldKey: 'contract.signed_name',
        page,
        x: MARGIN,
        y: top + 74,
        width: 260,
        fontSize: 10,
        color: DEFAULT_BRAND_COLORS.muted,
        visible: true,
        layout: 'absolute',
      },
      {
        id: 'signature-date',
        kind: 'field',
        fieldKey: 'contract.signed_date',
        page,
        x: MARGIN,
        y: top + 92,
        width: 260,
        fontSize: 10,
        color: DEFAULT_BRAND_COLORS.muted,
        visible: true,
        layout: 'absolute',
      }
    )
    if (options.initials) {
      this.elements.push({
        id: 'client-initials',
        kind: 'initial',
        fieldKey: 'sign.client.initials',
        page,
        label: 'Client initials',
        x: MARGIN + 300,
        y: top,
        width: 120,
        height: 48,
        fontSize: 10,
        visible: true,
        layout: 'absolute',
      })
    }
    this.y = top + 116
  }

  build(): DocumentTemplate {
    const pageCount = Math.max(
      1,
      ...this.elements.map((element) => (element.page ?? 0) + 1)
    )
    return normalizeDocumentTemplate(
      {
        version: 2,
        page: { ...DOCUMENT_PAGE },
        pages: Array.from({ length: pageCount }, () => ({ ...DOCUMENT_PAGE })),
        brandColors: { ...DEFAULT_BRAND_COLORS },
        preset: 'custom',
        footerDueText: '',
        elements: this.elements,
      },
      'contract'
    )
  }
}

function buildServiceAgreement(): DocumentTemplate {
  const layout = new ContractLayout()
  layout.header('Service Agreement')
  layout.text(
    'parties',
    'This Service Agreement ("Agreement") is made on {{document.date}} between {{company.name}} ("Provider") and {{client.name}} ("Client") for services at {{client.address}}.'
  )
  layout.heading('scope-heading', '1. Scope of work')
  layout.staffField('scope', 'Describe the work to be performed', 90)
  layout.heading('price-heading', '2. Price and payment')
  layout.staffField('price', 'Total price', 32)
  layout.staffField('payment_terms', 'Payment terms (deposit, due dates)', 44, false)
  layout.heading('terms-heading', '3. Terms and conditions')
  layout.text(
    'terms-scheduling',
    'Scheduling and access. Provider will perform the work on mutually agreed dates. Client will provide safe access to the property, utilities needed for the work, and will secure pets and valuables in the work area.'
  )
  layout.text(
    'terms-changes',
    'Changes. Work outside the scope above requires a written change approved by both parties and may change the price and schedule.'
  )
  layout.text(
    'terms-payment',
    'Payment. Invoices are due on receipt unless the payment terms above say otherwise. Balances more than 30 days past due may pause further work until paid.'
  )
  layout.text(
    'terms-warranty',
    'Workmanship. Provider will perform the work in a professional manner. Client should report any concern with the work within 14 days of completion so Provider can review and, where appropriate, correct it.'
  )
  layout.text(
    'terms-liability',
    'Liability. Provider is not responsible for pre-existing conditions, concealed defects, or damage caused by conditions outside Provider\'s control. Provider\'s total liability under this Agreement is limited to the amount paid for the work.'
  )
  layout.text(
    'terms-cancellation',
    'Cancellation. Either party may cancel scheduled work with at least 48 hours notice. Client pays for work already performed and materials already purchased.'
  )
  layout.text(
    'terms-entire',
    'Entire agreement. This Agreement is the complete agreement between the parties for this work and replaces any prior discussions. Changes must be in writing.'
  )
  layout.space(4)
  layout.checkbox('ack', 'I have read and agree to the terms and conditions of this Agreement.')
  layout.signatureBlock()
  return layout.build()
}

function buildMaintenanceAgreement(): DocumentTemplate {
  const layout = new ContractLayout()
  layout.header('Recurring Maintenance Agreement')
  layout.text(
    'parties',
    'This Recurring Maintenance Agreement is made on {{document.date}} between {{company.name}} ("Provider") and {{client.name}} ("Client") for the property at {{client.address}}.'
  )
  layout.heading('plan-heading', '1. Service plan')
  layout.staffField('services', 'Services included in each visit', 72)
  layout.staffField('frequency', 'Visit frequency (for example: every other week)', 32)
  layout.staffField('start_date', 'Start date', 32)
  layout.heading('rate-heading', '2. Rate')
  layout.staffField('rate', 'Price per visit or per month', 32)
  layout.heading('terms-heading', '3. Terms')
  layout.text(
    'terms-term',
    'Term and renewal. This Agreement starts on the start date above and continues month to month until either party cancels it.'
  )
  layout.text(
    'terms-cancel',
    'Cancellation. Either party may cancel with 30 days written notice. Visits completed before cancellation are billed at the rate above.'
  )
  layout.text(
    'terms-skips',
    'Skipped and rescheduled visits. Client may skip or reschedule a visit with at least 48 hours notice. Visits missed because Provider could not access the property may still be billed.'
  )
  layout.text(
    'terms-weather',
    'Weather and delays. Visits may be moved because of weather or conditions that make work unsafe. Provider will reschedule as soon as practical.'
  )
  layout.text(
    'terms-rate-changes',
    'Rate changes. Provider will give at least 30 days notice before changing the rate. Client may cancel before the new rate takes effect.'
  )
  layout.text(
    'terms-billing',
    'Billing. Provider invoices after each visit or monthly. Invoices are due on receipt and can be paid through the client portal.'
  )
  layout.space(4)
  layout.checkbox('auto_renew', 'I understand this agreement renews month to month until cancelled.')
  layout.signatureBlock()
  return layout.build()
}

function buildWorkAuthorization(): DocumentTemplate {
  const layout = new ContractLayout()
  layout.header('Work Authorization')
  layout.text(
    'intro',
    '{{client.name}} authorizes {{company.name}} to perform the work described below at {{client.address}}.'
  )
  layout.heading('work-heading', 'Work to be performed')
  layout.staffField('work', 'Description of work', 110)
  layout.heading('amount-heading', 'Authorized amount')
  layout.staffField('amount', 'Authorized amount', 32)
  layout.staffField('notes', 'Notes', 48, false)
  layout.text(
    'authorization',
    'Client authorizes the work above up to the authorized amount. Any additional work or cost requires Client\'s approval before it is performed. Client agrees to pay for the authorized work when it is completed.'
  )
  layout.signatureBlock({ initials: true })
  return layout.build()
}

function buildLiabilityWaiver(): DocumentTemplate {
  const layout = new ContractLayout()
  layout.header('Release and Waiver of Liability')
  layout.text(
    'intro',
    'In consideration of services provided by {{company.name}} ("Provider"), {{client.name}} ("Client") agrees to the following.'
  )
  layout.heading('activity-heading', 'Service or activity')
  layout.staffField('activity', 'Service or activity covered by this release', 56)
  layout.text(
    'risks',
    'Assumption of risk. Client understands that the service or activity may involve risks, including property damage and personal injury, and chooses to proceed with knowledge of those risks.'
  )
  layout.text(
    'release',
    'Release. To the fullest extent allowed by law, Client releases Provider and its employees from claims arising from the service or activity, except claims caused by Provider\'s gross negligence or willful misconduct.'
  )
  layout.text(
    'disclosure',
    'Disclosure. Client has told Provider about any known hazards, conditions, or concerns at the property that could affect the work.'
  )
  layout.text(
    'severability',
    'If any part of this release is found unenforceable, the rest remains in effect.'
  )
  layout.space(4)
  layout.checkbox('read', 'I have read this release, understand it, and sign it voluntarily.')
  layout.signatureBlock()
  return layout.build()
}

function buildBlank(): DocumentTemplate {
  const layout = new ContractLayout()
  layout.header('Agreement')
  layout.text(
    'body',
    'Write your agreement here. Use {{client.name}}, {{client.address}}, and other merge tags to fill in client details automatically.'
  )
  layout.space(360)
  layout.signatureBlock()
  return layout.build()
}

function buildSimpleAgreement(): DocumentTemplate {
  return normalizeDocumentTemplate(DEFAULT_CONTRACT_DOCUMENT_TEMPLATE, 'contract')
}

export const CONTRACT_STARTERS: ContractStarter[] = [
  {
    id: 'service-agreement',
    name: 'Service agreement',
    description: 'Scope, price, and standard terms for one-time jobs.',
    build: buildServiceAgreement,
  },
  {
    id: 'maintenance-agreement',
    name: 'Recurring maintenance',
    description: 'Visit frequency, rate, renewal, and cancellation terms.',
    build: buildMaintenanceAgreement,
  },
  {
    id: 'work-authorization',
    name: 'Work authorization',
    description: 'One-page approval for a job or change order, with initials.',
    build: buildWorkAuthorization,
  },
  {
    id: 'liability-waiver',
    name: 'Liability waiver',
    description: 'Release of liability with a read-and-agree checkbox.',
    build: buildLiabilityWaiver,
  },
  {
    id: 'simple-agreement',
    name: 'Simple agreement',
    description: 'The original one-page layout with notes, signature, and initials.',
    build: buildSimpleAgreement,
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'Company header and a signature block. Write your own terms.',
    build: buildBlank,
  },
]

export function getContractStarter(id: string): ContractStarter | null {
  return CONTRACT_STARTERS.find((starter) => starter.id === id) ?? null
}

export function isContractStarterId(value: string): value is ContractStarterId {
  return CONTRACT_STARTERS.some((starter) => starter.id === value)
}
