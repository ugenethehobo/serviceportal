import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accentForegroundForHex,
  hexToOklchString,
  normalizeAccentColor,
} from './personalization.ts'

test('normalizeAccentColor accepts valid hex and rejects invalid values', () => {
  assert.equal(normalizeAccentColor('#2563EB'), '#2563eb')
  assert.equal(normalizeAccentColor('blue'), null)
  assert.equal(normalizeAccentColor(null), null)
})

test('hexToOklchString returns an oklch color string', () => {
  const value = hexToOklchString('#2563eb')
  assert.match(value, /^oklch\(/)
})

test('accentForegroundForHex picks readable foreground colors', () => {
  assert.match(accentForegroundForHex('#2563eb'), /^oklch\(/)
  assert.match(accentForegroundForHex('#f8fafc'), /^oklch\(/)
})