export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function getGoogleMapsNavigationUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}

export function getAppleMapsNavigationUrl(address: string): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}&dirflg=d`
}

export function getPreferredNavigationUrl(address: string): string {
  const trimmed = address.trim()
  return isApplePlatform()
    ? getAppleMapsNavigationUrl(trimmed)
    : getGoogleMapsNavigationUrl(trimmed)
}

export function openNavigation(address: string): void {
  const trimmed = address.trim()
  if (!trimmed || trimmed === 'No address on file') return
  window.open(getPreferredNavigationUrl(trimmed), '_blank', 'noopener,noreferrer')
}

export function getNavigationLabel(): string {
  return isApplePlatform() ? 'Open in Apple Maps' : 'Open in Google Maps'
}