import type { DocumentElement } from '@/lib/document-template'
import {
  buildContractCheckboxFieldKey,
  buildContractInputFieldKey,
  buildContractStaffFieldKey,
  type ContractMergeFieldKey,
} from '@/lib/document-template-fields'

export type ContractFieldPresetGroup = 'client' | 'team' | 'data' | 'layout'

export type ContractFieldPresetId =
  | 'signature'
  | 'initials'
  | 'client-text'
  | 'checkbox'
  | 'signed-date'
  | 'signed-name'
  | 'team-text'
  | `data:${ContractMergeFieldKey}`
  | 'text-block'
  | 'divider'
  | 'logo'

export type ContractFieldPreset = {
  id: ContractFieldPresetId
  label: string
  description: string
  group: ContractFieldPresetGroup
  /** Only offered on builder layouts (not on top of uploaded PDFs). */
  builderOnly?: boolean
  size: (pdfMode: boolean) => { width: number; height: number }
  build: (base: ElementBase, pdfMode: boolean) => DocumentElement
}

type ElementBase = Pick<DocumentElement, 'id' | 'x' | 'y' | 'page' | 'visible' | 'layout'>

export const CONTRACT_FIELD_GROUP_LABELS: Record<ContractFieldPresetGroup, string> = {
  client: 'Client fills in',
  team: 'Your team fills in',
  data: 'Client & job details',
  layout: 'Layout',
}

function appearance(pdfMode: boolean) {
  return pdfMode ? ('overlay' as const) : undefined
}

const DATA_FIELDS: Array<{ key: ContractMergeFieldKey; label: string }> = [
  { key: 'client.name', label: 'Client name' },
  { key: 'client.address', label: 'Client address' },
  { key: 'client.email', label: 'Client email' },
  { key: 'client.phone', label: 'Client phone' },
  { key: 'client.contact_name', label: 'Contact name' },
  { key: 'company.name', label: 'Company name' },
  { key: 'document.date', label: 'Contract date' },
  { key: 'document.number', label: 'Contract number' },
  { key: 'job.title', label: 'Job title' },
  { key: 'job.visit_date', label: 'Visit date' },
]

export const CONTRACT_FIELD_PRESETS: ContractFieldPreset[] = [
  {
    id: 'signature',
    label: 'Signature',
    description: 'Client draws their signature',
    group: 'client',
    size: (pdf) => (pdf ? { width: 200, height: 40 } : { width: 260, height: 64 }),
    build: (base, pdf) => ({
      ...base,
      kind: 'signature',
      fieldKey: 'sign.client',
      label: 'Client signature',
      fontSize: 10,
      appearance: appearance(pdf),
    }),
  },
  {
    id: 'initials',
    label: 'Initials',
    description: 'Client draws their initials',
    group: 'client',
    size: (pdf) => (pdf ? { width: 70, height: 28 } : { width: 120, height: 48 }),
    build: (base, pdf) => ({
      ...base,
      kind: 'initial',
      fieldKey: 'sign.client.initials',
      label: 'Initials',
      fontSize: 10,
      appearance: appearance(pdf),
    }),
  },
  {
    id: 'client-text',
    label: 'Text answer',
    description: 'Client types a response',
    group: 'client',
    size: (pdf) => (pdf ? { width: 200, height: 18 } : { width: 260, height: 48 }),
    build: (base, pdf) => ({
      ...base,
      kind: 'input',
      fieldKey: buildContractInputFieldKey(base.id),
      label: 'Your answer',
      fontSize: 10,
      appearance: appearance(pdf),
    }),
  },
  {
    id: 'checkbox',
    label: 'Checkbox',
    description: 'Client checks to agree',
    group: 'client',
    size: (pdf) => (pdf ? { width: 14, height: 14 } : { width: 300, height: 16 }),
    build: (base, pdf) => ({
      ...base,
      kind: 'checkbox',
      fieldKey: buildContractCheckboxFieldKey(base.id),
      label: 'I agree to the terms above',
      fontSize: 10,
      appearance: appearance(pdf),
    }),
  },
  {
    id: 'signed-date',
    label: 'Date signed',
    description: 'Filled in when the client signs',
    group: 'client',
    size: () => ({ width: 140, height: 16 }),
    build: (base) => ({
      ...base,
      kind: 'field',
      fieldKey: 'contract.signed_date',
      fontSize: 10,
      appearance: 'overlay',
      width: 140,
    }),
  },
  {
    id: 'signed-name',
    label: 'Printed name',
    description: 'Signer’s typed legal name',
    group: 'client',
    size: () => ({ width: 180, height: 16 }),
    build: (base) => ({
      ...base,
      kind: 'field',
      fieldKey: 'contract.signed_name',
      fontSize: 10,
      appearance: 'overlay',
      width: 180,
    }),
  },
  {
    id: 'team-text',
    label: 'Team field',
    description: 'Price, scope, dates… filled per contract',
    group: 'team',
    size: (pdf) => (pdf ? { width: 200, height: 18 } : { width: 512, height: 40 }),
    build: (base, pdf) => ({
      ...base,
      kind: 'input',
      filledBy: 'staff',
      fieldKey: buildContractStaffFieldKey(base.id),
      label: 'Details',
      fontSize: 10,
      appearance: appearance(pdf),
    }),
  },
  ...DATA_FIELDS.map(
    (field): ContractFieldPreset => ({
      id: `data:${field.key}`,
      label: field.label,
      description: 'Filled in automatically',
      group: 'data',
      size: () => ({ width: 200, height: 16 }),
      build: (base) => ({
        ...base,
        kind: 'field',
        fieldKey: field.key,
        fontSize: 10,
        appearance: 'overlay',
        width: 200,
      }),
    })
  ),
  {
    id: 'text-block',
    label: 'Text block',
    description: 'Terms or clauses, with merge tags',
    group: 'layout',
    size: (pdf) => (pdf ? { width: 240, height: 42 } : { width: 512, height: 56 }),
    build: (base) => ({
      ...base,
      kind: 'text',
      text: 'New clause. Use {{client.name}} to insert client details.',
      fontSize: 10,
    }),
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal line',
    group: 'layout',
    builderOnly: true,
    size: () => ({ width: 512, height: 12 }),
    build: (base) => ({ ...base, kind: 'line', width: 512 }),
  },
  {
    id: 'logo',
    label: 'Company logo',
    description: 'Your logo from Settings',
    group: 'layout',
    size: () => ({ width: 110, height: 52 }),
    build: (base) => ({
      ...base,
      kind: 'image',
      fieldKey: 'company.logo',
      width: 110,
      height: 52,
    }),
  },
]

export function getContractFieldPreset(id: string): ContractFieldPreset | null {
  return CONTRACT_FIELD_PRESETS.find((preset) => preset.id === id) ?? null
}

export function getContractFieldPresets(pdfMode: boolean) {
  return CONTRACT_FIELD_PRESETS.filter((preset) => !(pdfMode && preset.builderOnly))
}

export function createContractElementId(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12)
  return `${prefix}-${random}`
}

/**
 * Builds a new element centered on (x, y) of the given page, clamped to the page.
 */
export function createContractElement(
  presetId: string,
  input: {
    x: number
    y: number
    page: number
    pageSize: { width: number; height: number }
    pdfMode: boolean
    id?: string
  }
): DocumentElement | null {
  const preset = getContractFieldPreset(presetId)
  if (!preset) return null

  const size = preset.size(input.pdfMode)
  const id = input.id ?? createContractElementId(preset.id.replace(/[^a-z]+/g, '-').replace(/-+$/, ''))
  const x = Math.round(
    Math.min(Math.max(0, input.x - size.width / 2), Math.max(0, input.pageSize.width - size.width))
  )
  const y = Math.round(
    Math.min(Math.max(0, input.y - size.height / 2), Math.max(0, input.pageSize.height - size.height))
  )

  return {
    ...preset.build(
      { id, x, y, page: input.page > 0 ? input.page : undefined, visible: true, layout: 'absolute' },
      input.pdfMode
    ),
    width: size.width,
    height: size.height,
  }
}

/** Copy of an element offset slightly, with fresh ids so its value is tracked separately. */
export function duplicateContractElement(element: DocumentElement): DocumentElement {
  const id = createContractElementId(element.kind)
  let fieldKey = element.fieldKey
  if (fieldKey?.startsWith('input.')) fieldKey = buildContractInputFieldKey(id)
  else if (fieldKey?.startsWith('staff.')) fieldKey = buildContractStaffFieldKey(id)
  else if (fieldKey?.startsWith('check.')) fieldKey = buildContractCheckboxFieldKey(id)

  return { ...element, id, fieldKey, x: element.x + 12, y: element.y + 12, locked: false }
}
