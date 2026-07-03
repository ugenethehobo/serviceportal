export type StructuredAddress = {
  street: string
  unit: string
  city: string
  state: string
  zip: string
}

export type StructuredAddressErrors = Partial<Record<keyof StructuredAddress, string>>

export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
] as const

const STATE_CODES = new Set<string>(US_STATES.map((state) => state.code))
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/

export function emptyStructuredAddress(): StructuredAddress {
  return { street: '', unit: '', city: '', state: '', zip: '' }
}

export function normalizeStructuredAddress(
  input: Partial<StructuredAddress> | null | undefined
): StructuredAddress {
  const zipRaw = input?.zip?.trim() || ''
  const zipDigits = zipRaw.replace(/[^\d-]/g, '')
  const zip =
    zipDigits.length === 9 && !zipDigits.includes('-')
      ? `${zipDigits.slice(0, 5)}-${zipDigits.slice(5)}`
      : zipDigits

  const stateRaw = input?.state?.trim().toUpperCase() || ''
  const stateMatch = US_STATES.find(
    (state) =>
      state.code === stateRaw ||
      state.name.toUpperCase() === stateRaw ||
      state.name.toUpperCase() === stateRaw.replace(/\./g, '')
  )

  return {
    street: input?.street?.trim() || '',
    unit: input?.unit?.trim() || '',
    city: input?.city?.trim() || '',
    state: stateMatch?.code || stateRaw,
    zip,
  }
}

type StructuredAddressRow = {
  address_street?: string | null
  address_unit?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
} | null

export function structuredAddressFromRow(row: StructuredAddressRow): StructuredAddress {
  if (!row?.address_street) {
    return emptyStructuredAddress()
  }

  return normalizeStructuredAddress({
    street: row.address_street,
    unit: row.address_unit || '',
    city: row.address_city || '',
    state: row.address_state || '',
    zip: row.address_zip || '',
  })
}

export function structuredAddressFromCompanyRow(company: StructuredAddressRow): StructuredAddress {
  return structuredAddressFromRow(company)
}

export function structuredAddressFromClientRow(client: StructuredAddressRow): StructuredAddress {
  return structuredAddressFromRow(client)
}

export function isStructuredAddressEmpty(address: StructuredAddress): boolean {
  return !address.street && !address.unit && !address.city && !address.state && !address.zip
}

export function validateStructuredAddress(
  address: StructuredAddress
): { valid: boolean; errors: StructuredAddressErrors } {
  const errors: StructuredAddressErrors = {}

  if (!address.street.trim()) {
    errors.street = 'Street address is required'
  } else if (address.street.trim().length < 3) {
    errors.street = 'Enter a complete street address'
  }

  if (!address.city.trim()) {
    errors.city = 'City is required'
  }

  if (!address.state.trim()) {
    errors.state = 'State is required'
  } else if (!STATE_CODES.has(address.state)) {
    errors.state = 'Select a valid US state'
  }

  if (!address.zip.trim()) {
    errors.zip = 'ZIP code is required'
  } else if (!ZIP_PATTERN.test(address.zip)) {
    errors.zip = 'Enter a valid 5-digit ZIP code'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/** Validates a complete address when any field is filled; empty is allowed. */
export function validateStructuredAddressIfPresent(
  address: StructuredAddress
): { valid: boolean; errors: StructuredAddressErrors } {
  if (isStructuredAddressEmpty(address)) {
    return { valid: true, errors: {} }
  }
  return validateStructuredAddress(address)
}

export function buildStructuredAddressDbFields(address: StructuredAddress): {
  address: string | null
  address_street: string | null
  address_unit: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
} {
  if (isStructuredAddressEmpty(address)) {
    return {
      address: null,
      address_street: null,
      address_unit: null,
      address_city: null,
      address_state: null,
      address_zip: null,
    }
  }

  const normalized = normalizeStructuredAddress(address)
  return {
    address_street: normalized.street,
    address_unit: normalized.unit || null,
    address_city: normalized.city,
    address_state: normalized.state,
    address_zip: normalized.zip,
    address: formatAddressForDisplay(normalized),
  }
}

export function getDisplayAddressFromClient(client: {
  address?: string | null
  address_street?: string | null
  address_unit?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
}): string {
  const structured = structuredAddressFromClientRow(client)
  if (structured.street) {
    return formatAddressForDisplay(structured)
  }
  return client.address?.trim() || ''
}

export function formatStreetLine(address: StructuredAddress): string {
  if (address.unit.trim()) {
    return `${address.street}, ${address.unit}`
  }
  return address.street
}

/** Single-line address optimized for geocoding services. */
export function formatAddressForGeocoding(address: StructuredAddress): string {
  return `${formatStreetLine(address)}, ${address.city}, ${address.state} ${address.zip}, United States`
}

/** Human-readable address stored on the company record. */
export function formatAddressForDisplay(address: StructuredAddress): string {
  return `${formatStreetLine(address)}, ${address.city}, ${address.state} ${address.zip}`
}

export function hasCompleteStructuredAddress(
  address: StructuredAddress
): address is StructuredAddress {
  return validateStructuredAddress(address).valid
}