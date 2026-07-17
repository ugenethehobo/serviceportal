import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getCrewsWorkspaceDefaultSection,
  getCrewsWorkspaceSections,
  groupCrewsWorkspaceSections,
  resolveCrewsWorkspaceSection,
} from '@/lib/crews-workspace'

describe('crews-workspace', () => {
  it('uses operations-first defaults for multi and solo', () => {
    assert.equal(getCrewsWorkspaceDefaultSection(false), 'dispatch')
    assert.equal(getCrewsWorkspaceDefaultSection(true), 'my-day')
  })

  it('exposes different sections for solo vs multi-crew', () => {
    const multi = getCrewsWorkspaceSections(false).map((s) => s.id)
    const solo = getCrewsWorkspaceSections(true).map((s) => s.id)
    assert.deepEqual(multi, ['dispatch', 'crews', 'team'])
    assert.deepEqual(solo, ['my-day', 'schedule'])
  })

  it('groups multi-crew sections into operations and people', () => {
    const groups = groupCrewsWorkspaceSections(getCrewsWorkspaceSections(false))
    assert.deepEqual(
      groups.map((g) => g.group.id),
      ['operations', 'people']
    )
    assert.deepEqual(
      groups[0].sections.map((s) => s.id),
      ['dispatch']
    )
    assert.deepEqual(
      groups[1].sections.map((s) => s.id),
      ['crews', 'team']
    )
  })

  it('resolves unknown section to fallback', () => {
    const sections = getCrewsWorkspaceSections(false)
    assert.equal(resolveCrewsWorkspaceSection('nope', sections, 'dispatch'), 'dispatch')
    assert.equal(resolveCrewsWorkspaceSection('team', sections, 'dispatch'), 'team')
  })
})
