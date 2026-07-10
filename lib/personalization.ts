export const ACCENT_COLOR_STORAGE_KEY = 'accent-color'
export const BACKGROUND_IMAGE_STORAGE_KEY = 'background-image-url'

export const ACCENT_COLOR_PRESETS = [
  { id: 'slate', label: 'Slate', hex: '#334155' },
  { id: 'blue', label: 'Blue', hex: '#2563eb' },
  { id: 'indigo', label: 'Indigo', hex: '#4f46e5' },
  { id: 'violet', label: 'Violet', hex: '#7c3aed' },
  { id: 'teal', label: 'Teal', hex: '#0d9488' },
  { id: 'green', label: 'Green', hex: '#16a34a' },
  { id: 'amber', label: 'Amber', hex: '#d97706' },
  { id: 'rose', label: 'Rose', hex: '#e11d48' },
] as const

const ACCENT_CSS_PROPERTIES = [
  '--accent',
  '--primary',
  '--ring',
  '--sidebar-primary',
] as const

const ACCENT_FOREGROUND_CSS_PROPERTIES = [
  '--accent-foreground',
  '--primary-foreground',
  '--sidebar-primary-foreground',
] as const

export type PersonalizationState = {
  accentColor: string | null
  backgroundImageUrl: string | null
}

export function normalizeAccentColor(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const hex = value.trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(hex)) return null
  return hex
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function srgbToLinear(channel: number) {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function rgbToOklch(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  const C = Math.sqrt(a * a + b2 * b2)
  let H = (Math.atan2(b2, a) * 180) / Math.PI
  if (H < 0) H += 360

  return {
    l: Math.max(0, Math.min(1, L)),
    c: Math.max(0, C),
    h: Number.isFinite(H) ? H : 0,
  }
}

export function hexToOklchString(hex: string): string {
  const { l, c, h } = rgbToOklch(hex)
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`
}

export function accentForegroundForHex(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? 'oklch(0.21 0.006 285.885)' : 'oklch(0.985 0 0)'
}

export function applyAccentColorToDocument(accentColor: string | null) {
  if (typeof document === 'undefined') return

  const normalized = normalizeAccentColor(accentColor)
  if (!normalized) {
    clearAccentColorFromDocument()
    return
  }

  const base = hexToOklchString(normalized)
  const foreground = accentForegroundForHex(normalized)
  const ring = hexToOklchString(normalized)

  for (const property of ACCENT_CSS_PROPERTIES) {
    document.documentElement.style.setProperty(property, base)
  }
  for (const property of ACCENT_FOREGROUND_CSS_PROPERTIES) {
    document.documentElement.style.setProperty(property, foreground)
  }
  document.documentElement.style.setProperty('--ring', ring)
}

export function clearAccentColorFromDocument() {
  if (typeof document === 'undefined') return

  for (const property of ACCENT_CSS_PROPERTIES) {
    document.documentElement.style.removeProperty(property)
  }
  for (const property of ACCENT_FOREGROUND_CSS_PROPERTIES) {
    document.documentElement.style.removeProperty(property)
  }
  document.documentElement.style.removeProperty('--ring')
}

export function setBackgroundBodyClass(enabled: boolean) {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('has-app-background', enabled)
  document.documentElement.toggleAttribute('data-app-background', enabled)
}

export function shellBackgroundClass(hasAppBackground: boolean) {
  return hasAppBackground ? 'bg-transparent' : 'bg-background'
}

export function chromeBackgroundClass(hasAppBackground: boolean) {
  return hasAppBackground ? 'bg-transparent' : 'bg-background'
}

export function chromeHeaderBackgroundClass(hasAppBackground: boolean) {
  return hasAppBackground ? 'bg-transparent' : 'bg-background/95 backdrop-blur'
}

export function chromeSheetClass(hasAppBackground: boolean) {
  return hasAppBackground ? 'bg-transparent!' : ''
}

/** Mobile slide-out nav — solid surface that follows light/dark theme (never wallpaper-transparent). */
export function chromeMobileSheetClass() {
  return 'border-border bg-background! text-foreground shadow-xl'
}

/** Inline script snippet to enable transparent shell surfaces before React hydrates. */
export function buildBackgroundBootstrapSnippet(serverBackgroundUrl: string | null): string {
  if (!serverBackgroundUrl) return ''
  return `document.body.classList.add('has-app-background');document.documentElement.setAttribute('data-app-background','');`
}

/** Inline script snippet to apply accent CSS vars before React hydrates. */
export function buildAccentBootstrapSnippet(
  storageKey: string,
  serverAccent: string | null
): string {
  const fallback = serverAccent ?? ''
  return `function _h2o(h){var n=h.replace('#',''),r=parseInt(n.slice(0,2),16),g=parseInt(n.slice(2,4),16),b=parseInt(n.slice(4,6),16),lr=r/255<=0.04045?r/255/12.92:Math.pow((r/255+0.055)/1.055,2.4),lg=g/255<=0.04045?g/255/12.92:Math.pow((g/255+0.055)/1.055,2.4),lb=b/255<=0.04045?b/255/12.92:Math.pow((b/255+0.055)/1.055,2.4),l=0.4122214708*lr+0.5363325363*lg+0.0514459929*lb,m=0.2119034982*lr+0.6806995451*lg+0.1073969566*lb,s=0.0883024619*lr+0.2817188376*lg+0.6299787005*lb,l_=Math.cbrt(l),m_=Math.cbrt(m),s_=Math.cbrt(s),L=0.2104542553*l_+0.793617785*m_-0.0040720468*s_,a=1.9779984951*l_-2.428592205*m_+0.4505937099*s_,b2=0.0259040371*l_+0.7827717662*m_-0.808675766*s_,C=Math.sqrt(a*a+b2*b2),H=Math.atan2(b2,a)*180/Math.PI;H<0&&(H+=360);return'oklch('+Math.max(0,Math.min(1,L)).toFixed(3)+' '+Math.max(0,C).toFixed(3)+' '+H.toFixed(1)+')'}function _af(h){var n=h.replace('#',''),r=parseInt(n.slice(0,2),16),g=parseInt(n.slice(2,4),16),b=parseInt(n.slice(4,6),16);return(0.299*r+0.587*g+0.114*b)/255>0.62?'oklch(0.21 0.006 285.885)':'oklch(0.985 0 0)'}function _aa(hex){var b=_h2o(hex),f=_af(hex),r=document.documentElement;r.style.setProperty('--accent',b);r.style.setProperty('--primary',b);r.style.setProperty('--ring',b);r.style.setProperty('--sidebar-primary',b);r.style.setProperty('--accent-foreground',f);r.style.setProperty('--primary-foreground',f);r.style.setProperty('--sidebar-primary-foreground',f)}var a=localStorage.getItem('${storageKey}')||'${fallback}';if(a&&/^#[0-9a-f]{6}$/i.test(a))_aa(a.toLowerCase());`
}