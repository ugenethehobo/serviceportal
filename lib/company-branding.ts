export type CompanyBranding = {
  name?: string
  logo_url?: string | null
}

export const COMPANY_BRANDING_UPDATED_EVENT = 'company-branding-updated'

export function dispatchCompanyBrandingUpdate(update: CompanyBranding) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(COMPANY_BRANDING_UPDATED_EVENT, { detail: update })
  )
}

export function subscribeCompanyBrandingUpdates(
  handler: (update: CompanyBranding) => void
) {
  if (typeof window === 'undefined') return () => {}

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<CompanyBranding>
    if (customEvent.detail) handler(customEvent.detail)
  }

  window.addEventListener(COMPANY_BRANDING_UPDATED_EVENT, listener)
  return () => window.removeEventListener(COMPANY_BRANDING_UPDATED_EVENT, listener)
}