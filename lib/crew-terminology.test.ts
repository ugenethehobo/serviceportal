import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_CREW_LABEL,
  DEFAULT_CREW_LABEL_SINGULAR,
  deriveCrewLabelSingular,
  getActiveCrewsHeading,
  getCrewTerminology,
  getCrewsNavLabel,
  getCrewsSearchGroupLabel,
  normalizeCrewLabel,
} from '@/lib/crew-terminology'

describe('crew-terminology', () => {
  it('defaults empty labels to Crews', () => {
    assert.equal(normalizeCrewLabel(null), DEFAULT_CREW_LABEL)
    assert.equal(normalizeCrewLabel(''), DEFAULT_CREW_LABEL)
    assert.equal(normalizeCrewLabel('   '), DEFAULT_CREW_LABEL)
  })

  it('trims, collapses spaces, and caps length', () => {
    assert.equal(normalizeCrewLabel('  Field  Teams  '), 'Field Teams')
    assert.equal(normalizeCrewLabel('x'.repeat(50)).length, 32)
  })

  it('derives singular forms', () => {
    assert.equal(deriveCrewLabelSingular('Crews'), DEFAULT_CREW_LABEL_SINGULAR)
    assert.equal(deriveCrewLabelSingular('Teams'), 'Team')
    assert.equal(deriveCrewLabelSingular('Units'), 'Unit')
    assert.equal(deriveCrewLabelSingular('People'), 'People')
    assert.equal(deriveCrewLabelSingular('Squad'), 'Squad')
  })

  it('builds terminology bag', () => {
    const t = getCrewTerminology('Teams')
    assert.equal(t.plural, 'Teams')
    assert.equal(t.singular, 'Team')
    assert.equal(t.pluralLower, 'teams')
    assert.equal(t.singularLower, 'team')
  })

  it('nav label is Team in solo, custom otherwise', () => {
    assert.equal(getCrewsNavLabel(true, 'Teams'), 'Team')
    assert.equal(getCrewsNavLabel(false, null), 'Crews')
    assert.equal(getCrewsNavLabel(false, 'Units'), 'Units')
  })

  it('active heading and search group use custom plural', () => {
    assert.equal(getActiveCrewsHeading(true), "Today's Schedule")
    assert.equal(getActiveCrewsHeading(false, 'Teams'), 'Active Teams Today')
    assert.equal(getCrewsSearchGroupLabel(false, 'Units'), 'Units')
    assert.equal(getCrewsSearchGroupLabel(true, 'Units'), 'Team')
  })
})
