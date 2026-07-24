export const ACCENT_COLOR_STORAGE_KEY = 'accent-color'
export const BACKGROUND_IMAGE_STORAGE_KEY = 'background-image-url'
export const CARD_COLOR_STORAGE_KEY = 'card-color'
export const TEXT_COLOR_STORAGE_KEY = 'text-color'
export const BACKGROUND_COLOR_STORAGE_KEY = 'background-color'

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

/** Defaults used as picker starting points when a custom value is unset. */
export const SURFACE_COLOR_DEFAULTS = {
  accent: '#2563eb',
  cardLight: '#ffffff',
  cardDark: '#34343a',
  textLight: '#1a1a1f',
  textDark: '#fafafa',
  backgroundLight: '#f5f5f5',
  backgroundDark: '#18181b',
} as const

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

const CARD_CSS_PROPERTIES = ['--card', '--popover', '--sidebar'] as const

/** Nested chrome that should track the card surface (icon wells, inset rows, etc.). */
const NESTED_SURFACE_CSS_PROPERTIES = ['--muted', '--secondary'] as const

/** Hairline borders/dividers — must track theme, not text color (avoids harsh white rings in light mode). */
const BORDER_CSS_PROPERTIES = ['--border', '--input'] as const

const FOREGROUND_CSS_PROPERTIES = [
  '--foreground',
  '--card-foreground',
  '--popover-foreground',
  '--sidebar-foreground',
  '--secondary-foreground',
] as const

const MUTED_FOREGROUND_PROPERTY = '--muted-foreground' as const

/** Surfaces want light colors in light mode / dark in dark. Text is the opposite. */
export type ThemeColorRole = 'text' | 'surface'

export type PersonalizationState = {
  accentColor: string | null
  backgroundImageUrl: string | null
  /** Solid app background (hex). Mutually exclusive with image in the settings UI. */
  backgroundColor: string | null
  cardColor: string | null
  textColor: string | null
}

export type BackgroundMode = 'default' | 'solid' | 'image'

export function resolveBackgroundMode(state: {
  backgroundImageUrl: string | null
  backgroundColor: string | null
}): BackgroundMode {
  if (state.backgroundImageUrl) return 'image'
  if (state.backgroundColor) return 'solid'
  return 'default'
}

/** Accepts #RGB or #RRGGBB; normalizes to lowercase #rrggbb. */
export function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  let hex = value.trim().toLowerCase()
  if (!hex.startsWith('#')) hex = `#${hex}`
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  }
  if (!/^#[0-9a-f]{6}$/.test(hex)) return null
  return hex
}

/** @deprecated Prefer normalizeHexColor — kept for existing call sites. */
export function normalizeAccentColor(value: string | null | undefined): string | null {
  return normalizeHexColor(value)
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

function linearToSrgb(channel: number) {
  const value = Math.max(0, Math.min(1, channel))
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
}

function oklchToHex(l: number, c: number, h: number): string {
  const hRad = (h * Math.PI) / 180
  const a = c * Math.cos(hRad)
  const b2 = c * Math.sin(hRad)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b2
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b2
  const s_ = l - 0.0894841775 * a - 1.291485548 * b2

  const l3 = l_ ** 3
  const m3 = m_ ** 3
  const s3 = s_ ** 3

  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  const r = Math.round(linearToSrgb(rLin) * 255)
  const g = Math.round(linearToSrgb(gLin) * 255)
  const b = Math.round(linearToSrgb(bLin) * 255)

  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
    .join('')}`
}

/** Invert lightness in OKLCH while keeping hue/chroma (light ↔ dark pair). */
export function invertHexLightness(hex: string): string {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return hex
  const { l, c, h } = rgbToOklch(normalized)
  const invertedL = Math.max(0.05, Math.min(0.98, 1 - l))
  return oklchToHex(invertedL, c, h)
}

/**
 * Map a stored company color onto the active theme.
 * - Surfaces (card / page bg): stored value is the **dark-mode** half of the pair;
 *   light mode always uses the lightness inverse (see surfaceColorForStorage).
 * - Text: dark in light mode, light in dark mode (luminance heuristic).
 */
export function resolveColorForTheme(
  hex: string,
  isDark: boolean,
  role: ThemeColorRole
): string {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return hex

  if (role === 'surface') {
    return resolveSurfaceColorForTheme(normalized, isDark)
  }

  const { l } = rgbToOklch(normalized)
  const isLightColor = l > 0.5
  const wantsLight = isDark // text: light text in dark mode
  if (isLightColor === wantsLight) return normalized
  return invertHexLightness(normalized)
}

/**
 * Surfaces are stored as the dark-mode member of a light/dark pair.
 * Light mode always paints the inverse so a pick in one mode flips in the other.
 *
 * Legacy light-mode-only values (L > 0.55) are coerced to the dark twin first.
 */
export function resolveSurfaceColorForTheme(hex: string, isDark: boolean): string {
  const darkMember = coerceSurfaceToDarkMember(hex)
  if (!darkMember) return hex
  return isDark ? darkMember : invertHexLightness(darkMember)
}

/** Normalize any stored surface hex to the dark-mode half of its pair. */
export function coerceSurfaceToDarkMember(hex: string | null | undefined): string | null {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return null
  const { l } = rgbToOklch(normalized)
  // Legacy: light surfaces were stored as the light-mode pick — convert to dark twin.
  if (l > 0.55) return invertHexLightness(normalized)
  return normalized
}

/**
 * When the user picks a surface color in the current theme, store the dark-mode
 * half of the pair so the other mode can always invert.
 *
 * - Dark mode pick → store as-is (that is the dark half)
 * - Light mode pick → store the inverse (dark half); light mode re-inverts on apply
 */
export function surfaceColorForStorage(pickedHex: string, pickedInDark: boolean): string | null {
  const normalized = normalizeHexColor(pickedHex)
  if (!normalized) return null
  return pickedInDark ? normalized : invertHexLightness(normalized)
}

export function isDocumentDark(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

/** Nested surface slightly offset from the card so inset chrome still reads as "raised". */
function nestedSurfaceOklchFromCard(cardHex: string, isDark: boolean): string {
  const { l, c, h } = rgbToOklch(cardHex)
  const nestedL = isDark
    ? Math.min(0.95, l + 0.065)
    : Math.max(0.02, l - 0.035)
  const nestedC = Math.max(0, c * 0.85)
  return `oklch(${nestedL.toFixed(3)} ${nestedC.toFixed(3)} ${h.toFixed(1)})`
}

function mutedForegroundOklchFromText(textHex: string, isDark: boolean): string {
  const { l, c, h } = rgbToOklch(textHex)
  const mutedL = isDark ? Math.max(0.45, l - 0.22) : Math.min(0.55, l + 0.22)
  return `oklch(${mutedL.toFixed(3)} ${(c * 0.45).toFixed(3)} ${h.toFixed(1)})`
}

/** Canonical body/heading text for the active theme (used when no custom text color). */
export function themeDefaultTextHex(isDark: boolean): string {
  return isDark ? SURFACE_COLOR_DEFAULTS.textDark : SURFACE_COLOR_DEFAULTS.textLight
}

/**
 * Soft hairlines matching shadcn: translucent white on dark, translucent black on light.
 * Avoids coupling borders to --foreground (which made light-mode rings harsh white).
 */
export function themeBorderOklch(isDark: boolean): { border: string; input: string } {
  if (isDark) {
    return {
      border: 'oklch(1 0 0 / 10%)',
      input: 'oklch(1 0 0 / 15%)',
    }
  }
  return {
    border: 'oklch(0 0 0 / 10%)',
    input: 'oklch(0 0 0 / 12%)',
  }
}

function applyForegroundStackToDocument(textHex: string, isDark: boolean) {
  if (typeof document === 'undefined') return
  const normalized = normalizeHexColor(textHex)
  if (!normalized) return

  const fg = hexToOklchString(normalized)
  for (const property of FOREGROUND_CSS_PROPERTIES) {
    document.documentElement.style.setProperty(property, fg)
  }
  document.documentElement.style.setProperty(
    MUTED_FOREGROUND_PROPERTY,
    mutedForegroundOklchFromText(normalized, isDark)
  )
}

function applyThemeBordersToDocument(isDark: boolean) {
  if (typeof document === 'undefined') return
  const { border, input } = themeBorderOklch(isDark)
  document.documentElement.style.setProperty('--border', border)
  document.documentElement.style.setProperty('--input', input)
}

function clearThemeBordersFromDocument() {
  if (typeof document === 'undefined') return
  for (const property of BORDER_CSS_PROPERTIES) {
    document.documentElement.style.removeProperty(property)
  }
}

export function accentForegroundForHex(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? 'oklch(0.21 0.006 285.885)' : 'oklch(0.985 0 0)'
}

export function applyAccentColorToDocument(accentColor: string | null) {
  if (typeof document === 'undefined') return

  const normalized = normalizeHexColor(accentColor)
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

export function applyCardColorToDocument(
  cardColor: string | null,
  options?: {
    setAutoForeground?: boolean
    /** When true, also paint muted/secondary so inset chrome matches the card. */
    cascadeNested?: boolean
    isDark?: boolean
  }
) {
  if (typeof document === 'undefined') return

  const normalized = normalizeHexColor(cardColor)
  if (!normalized) {
    clearCardColorFromDocument()
    return
  }

  const isDark = options?.isDark ?? isDocumentDark()
  const surface = hexToOklchString(normalized)
  for (const property of CARD_CSS_PROPERTIES) {
    document.documentElement.style.setProperty(property, surface)
  }

  if (options?.cascadeNested !== false) {
    const nested = nestedSurfaceOklchFromCard(normalized, isDark)
    for (const property of NESTED_SURFACE_CSS_PROPERTIES) {
      document.documentElement.style.setProperty(property, nested)
    }
    // Borders track theme (soft black/white), not text — keeps light mode hairlines subtle.
    applyThemeBordersToDocument(isDark)
  }

  if (options?.setAutoForeground !== false) {
    // Full foreground stack for the active theme (not card luminance alone).
    applyForegroundStackToDocument(themeDefaultTextHex(isDark), isDark)
  }
}

export function clearCardColorFromDocument() {
  if (typeof document === 'undefined') return
  for (const property of CARD_CSS_PROPERTIES) {
    document.documentElement.style.removeProperty(property)
  }
  for (const property of NESTED_SURFACE_CSS_PROPERTIES) {
    document.documentElement.style.removeProperty(property)
  }
  clearThemeBordersFromDocument()
  document.documentElement.style.removeProperty('--secondary-foreground')
}

export function applyTextColorToDocument(
  textColor: string | null,
  options?: { isDark?: boolean }
) {
  if (typeof document === 'undefined') return

  const normalized = normalizeHexColor(textColor)
  if (!normalized) {
    clearTextColorFromDocument()
    return
  }

  const isDark = options?.isDark ?? isDocumentDark()
  applyForegroundStackToDocument(normalized, isDark)
}

export function clearTextColorFromDocument() {
  if (typeof document === 'undefined') return
  for (const property of FOREGROUND_CSS_PROPERTIES) {
    document.documentElement.style.removeProperty(property)
  }
  document.documentElement.style.removeProperty(MUTED_FOREGROUND_PROPERTY)
}

/**
 * Solid page background. Skipped when a wallpaper image is active
 * (image mode uses transparent body + AppBackground layer).
 */
export function applyBackgroundColorToDocument(
  backgroundColor: string | null,
  options?: { hasImage?: boolean }
) {
  if (typeof document === 'undefined') return

  if (options?.hasImage) {
    document.documentElement.style.removeProperty('--background')
    return
  }

  const normalized = normalizeHexColor(backgroundColor)
  if (!normalized) {
    document.documentElement.style.removeProperty('--background')
    return
  }

  document.documentElement.style.setProperty('--background', hexToOklchString(normalized))
}

export function applyPersonalizationToDocument(
  state: PersonalizationState,
  options?: { isDark?: boolean }
) {
  const isDark = options?.isDark ?? isDocumentDark()

  applyAccentColorToDocument(state.accentColor)

  if (state.cardColor) {
    const resolvedCard = resolveColorForTheme(state.cardColor, isDark, 'surface')
    applyCardColorToDocument(resolvedCard, {
      setAutoForeground: !state.textColor,
      cascadeNested: true,
      isDark,
    })
  } else {
    clearCardColorFromDocument()
  }

  if (state.textColor) {
    const resolvedText = resolveColorForTheme(state.textColor, isDark, 'text')
    applyTextColorToDocument(resolvedText, { isDark })
  } else if (state.cardColor) {
    // No custom text: force theme-correct body text (white in dark, near-black in light).
    applyForegroundStackToDocument(themeDefaultTextHex(isDark), isDark)
  } else {
    clearTextColorFromDocument()
  }

  if (state.backgroundColor) {
    const resolvedBg = resolveColorForTheme(state.backgroundColor, isDark, 'surface')
    applyBackgroundColorToDocument(resolvedBg, {
      hasImage: Boolean(state.backgroundImageUrl),
    })
  } else {
    applyBackgroundColorToDocument(null, {
      hasImage: Boolean(state.backgroundImageUrl),
    })
  }
  setBackgroundBodyClass(Boolean(state.backgroundImageUrl))
}

export function clearSurfaceColorsFromDocument() {
  clearCardColorFromDocument()
  clearTextColorFromDocument()
  if (typeof document !== 'undefined') {
    document.documentElement.style.removeProperty('--background')
  }
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

/**
 * Bootstrap card / text / solid background before React hydrates.
 * Prefer localStorage (instant) then server values.
 * Applies light/dark inversion and cascades muted/secondary from card.
 */
export function buildSurfaceBootstrapSnippet(server: {
  cardColor: string | null
  textColor: string | null
  backgroundColor: string | null
  backgroundImageUrl: string | null
}): string {
  const esc = (v: string | null) => (v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `(function(){function okl(h){var n=h.replace('#',''),r=parseInt(n.slice(0,2),16),g=parseInt(n.slice(2,4),16),b=parseInt(n.slice(4,6),16),lr=r/255<=0.04045?r/255/12.92:Math.pow((r/255+0.055)/1.055,2.4),lg=g/255<=0.04045?g/255/12.92:Math.pow((g/255+0.055)/1.055,2.4),lb=b/255<=0.04045?b/255/12.92:Math.pow((b/255+0.055)/1.055,2.4),l=0.4122214708*lr+0.5363325363*lg+0.0514459929*lb,m=0.2119034982*lr+0.6806995451*lg+0.1073969566*lb,s=0.0883024619*lr+0.2817188376*lg+0.6299787005*lb,l_=Math.cbrt(l),m_=Math.cbrt(m),s_=Math.cbrt(s),L=0.2104542553*l_+0.793617785*m_-0.0040720468*s_,a=1.9779984951*l_-2.428592205*m_+0.4505937099*s_,b2=0.0259040371*l_+0.7827717662*m_-0.808675766*s_,C=Math.sqrt(a*a+b2*b2),H=Math.atan2(b2,a)*180/Math.PI;H<0&&(H+=360);return{l:Math.max(0,Math.min(1,L)),c:Math.max(0,C),h:H}}function h2o(h){var o=okl(h);return'oklch('+o.l.toFixed(3)+' '+o.c.toFixed(3)+' '+o.h.toFixed(1)+')'}function o2h(L,C,H){var hr=H*Math.PI/180,a=C*Math.cos(hr),b2=C*Math.sin(hr),l_=L+0.3963377774*a+0.2158037573*b2,m_=L-0.1055613458*a-0.0638541728*b2,s_=L-0.0894841775*a-1.291485548*b2,l3=l_*l_*l_,m3=m_*m_*m_,s3=s_*s_*s_,rl=4.0767416621*l3-3.3077115913*m3+0.2309699292*s3,gl=-1.2684380046*l3+2.6097574011*m3-0.3413193965*s3,bl=-0.0041960863*l3-0.7034186147*m3+1.707614701*s3;function ts(x){x=Math.max(0,Math.min(1,x));return x<=0.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-0.055}function ch(v){return Math.max(0,Math.min(255,Math.round(ts(v)*255))).toString(16).padStart(2,'0')}return'#'+ch(rl)+ch(gl)+ch(bl)}function inv(h){var o=okl(h);return o2h(Math.max(0.05,Math.min(0.98,1-o.l)),o.c,o.h)}function resText(h,dark){var o=okl(h),light=o.l>0.5;return light===dark?h:inv(h)}function resSurface(h,dark){var o=okl(h),dm=o.l>0.55?inv(h):h;return dark?dm:inv(dm)}function ok(h){return h&&/^#[0-9a-f]{6}$/i.test(h)?h.toLowerCase():null}function setFg(hex,dark){var tf=h2o(hex),to=okl(hex),ml=dark?Math.max(0.45,to.l-0.22):Math.min(0.55,to.l+0.22),mf='oklch('+ml.toFixed(3)+' '+(to.c*0.45).toFixed(3)+' '+to.h.toFixed(1)+')';r.style.setProperty('--foreground',tf);r.style.setProperty('--card-foreground',tf);r.style.setProperty('--popover-foreground',tf);r.style.setProperty('--sidebar-foreground',tf);r.style.setProperty('--secondary-foreground',tf);r.style.setProperty('--muted-foreground',mf)}var r=document.documentElement,dark=r.classList.contains('dark');var card=ok(localStorage.getItem('${CARD_COLOR_STORAGE_KEY}')||'${esc(server.cardColor)}');var text=ok(localStorage.getItem('${TEXT_COLOR_STORAGE_KEY}')||'${esc(server.textColor)}');var bg=ok(localStorage.getItem('${BACKGROUND_COLOR_STORAGE_KEY}')||'${esc(server.backgroundColor)}');var hasImg=${server.backgroundImageUrl ? 'true' : 'false'};if(card){card=resSurface(card,dark);var cs=h2o(card);r.style.setProperty('--card',cs);r.style.setProperty('--popover',cs);r.style.setProperty('--sidebar',cs);var no=okl(card),nl=dark?Math.min(0.95,no.l+0.065):Math.max(0.02,no.l-0.035),ns='oklch('+nl.toFixed(3)+' '+(no.c*0.85).toFixed(3)+' '+no.h.toFixed(1)+')';r.style.setProperty('--muted',ns);r.style.setProperty('--secondary',ns);r.style.setProperty('--border',dark?'oklch(1 0 0 / 10%)':'oklch(0 0 0 / 10%)');r.style.setProperty('--input',dark?'oklch(1 0 0 / 15%)':'oklch(0 0 0 / 12%)')}if(text){setFg(resText(text,dark),dark)}else if(card){setFg(dark?'${SURFACE_COLOR_DEFAULTS.textDark}':'${SURFACE_COLOR_DEFAULTS.textLight}',dark)}if(bg&&!hasImg){bg=resSurface(bg,dark);r.style.setProperty('--background',h2o(bg))}})();`
}