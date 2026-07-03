const STORAGE_BUCKET = 'company-logos'

/** Extract the object path inside the company-logos bucket from a stored value. */
export function getCompanyLogoStoragePath(logoRef: string | null | undefined): string | null {
  if (!logoRef?.trim()) return null

  const trimmed = logoRef.trim()

  if (!trimmed.startsWith('http')) {
    return trimmed.replace(/^\/+/, '')
  }

  try {
    const url = new URL(trimmed)
    const publicMarker = `/object/public/${STORAGE_BUCKET}/`
    const publicIndex = url.pathname.indexOf(publicMarker)
    if (publicIndex >= 0) {
      return decodeURIComponent(url.pathname.slice(publicIndex + publicMarker.length))
    }

    const signMarker = `/object/sign/${STORAGE_BUCKET}/`
    const signIndex = url.pathname.indexOf(signMarker)
    if (signIndex >= 0) {
      return decodeURIComponent(url.pathname.slice(signIndex + signMarker.length))
    }
  } catch {
    return null
  }

  return null
}

export function isCompanyLogoStoragePath(logoRef: string | null | undefined): boolean {
  if (!logoRef?.trim()) return false
  return !logoRef.trim().startsWith('http')
}