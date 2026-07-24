import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accentForegroundForHex,
  hexToOklchString,
  invertHexLightness,
  normalizeHexColor,
  resolveBackgroundMode,
  resolveColorForTheme,
  resolveSurfaceColorForTheme,
  surfaceColorForStorage,
  themeBorderOklch,
  themeDefaultTextHex,
} from './personalization.ts'

test('normalizeHexColor accepts valid hex and rejects invalid values', () => {
  assert.equal(normalizeHexColor('#2563EB'), '#2563eb')
  assert.equal(normalizeHexColor('#abc'), '#aabbcc')
  assert.equal(normalizeHexColor('blue'), null)
  assert.equal(normalizeHexColor(null), null)
})

test('hexToOklchString returns an oklch color string', () => {
  const value = hexToOklchString('#2563eb')
  assert.match(value, /^oklch\(/)
})

test('accentForegroundForHex picks readable foreground colors', () => {
  assert.match(accentForegroundForHex('#2563eb'), /^oklch\(/)
  assert.match(accentForegroundForHex('#f8fafc'), /^oklch\(/)
})

test('resolveBackgroundMode prefers image over solid over default', () => {
  assert.equal(
    resolveBackgroundMode({ backgroundImageUrl: 'https://x', backgroundColor: '#fff' }),
    'image'
  )
  assert.equal(
    resolveBackgroundMode({ backgroundImageUrl: null, backgroundColor: '#112233' }),
    'solid'
  )
  assert.equal(
    resolveBackgroundMode({ backgroundImageUrl: null, backgroundColor: null }),
    'default'
  )
})

test('invertHexLightness flips near-white to near-black', () => {
  const inverted = invertHexLightness('#fafafa')
  assert.match(inverted, /^#[0-9a-f]{6}$/)
  // Double invert returns close to original lightness band
  const twice = invertHexLightness(inverted)
  assert.equal(twice.startsWith('#'), true)
})

test('resolveColorForTheme keeps white text in dark mode and inverts in light mode', () => {
  assert.equal(resolveColorForTheme('#fafafa', true, 'text'), '#fafafa')
  const lightModeText = resolveColorForTheme('#fafafa', false, 'text')
  assert.notEqual(lightModeText, '#fafafa')
  // Light mode text should be dark (low luminance)
  const r = parseInt(lightModeText.slice(1, 3), 16)
  const g = parseInt(lightModeText.slice(3, 5), 16)
  const b = parseInt(lightModeText.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  assert.ok(luminance < 0.5, `expected dark text, got luminance ${luminance}`)
})

test('resolveColorForTheme keeps dark card in dark mode and inverts in light mode', () => {
  assert.equal(resolveColorForTheme('#34343a', true, 'surface'), '#34343a')
  const lightCard = resolveColorForTheme('#34343a', false, 'surface')
  assert.notEqual(lightCard, '#34343a')
  const r = parseInt(lightCard.slice(1, 3), 16)
  const g = parseInt(lightCard.slice(3, 5), 16)
  const b = parseInt(lightCard.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  assert.ok(luminance > 0.5, `expected light card, got luminance ${luminance}`)
})

test('surfaceColorForStorage + resolveSurfaceColorForTheme form a true light/dark pair', () => {
  const darkPick = '#2a2a32'
  const storedFromDark = surfaceColorForStorage(darkPick, true)
  assert.equal(storedFromDark, darkPick)
  assert.equal(resolveSurfaceColorForTheme(storedFromDark!, true), darkPick)
  const lightTwin = resolveSurfaceColorForTheme(storedFromDark!, false)
  assert.notEqual(lightTwin, darkPick)
  assert.ok(rgbLuminance(lightTwin) > 0.5)

  const lightPick = '#f4f4f5'
  const storedFromLight = surfaceColorForStorage(lightPick, false)
  assert.notEqual(storedFromLight, lightPick)
  // Light mode shows ~the original pick
  const resolvedLight = resolveSurfaceColorForTheme(storedFromLight!, false)
  assert.ok(rgbLuminance(resolvedLight) > 0.5)
  // Dark mode shows the stored dark half
  assert.ok(rgbLuminance(resolveSurfaceColorForTheme(storedFromLight!, true)) < 0.5)
})

function rgbLuminance(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

test('themeDefaultTextHex is light in dark mode and dark in light mode', () => {
  assert.equal(themeDefaultTextHex(true), '#fafafa')
  assert.equal(themeDefaultTextHex(false), '#1a1a1f')
})

test('themeBorderOklch uses soft white in dark and soft black in light', () => {
  assert.match(themeBorderOklch(true).border, /1 0 0 \/ 10%/)
  assert.match(themeBorderOklch(false).border, /0 0 0 \/ 10%/)
})
