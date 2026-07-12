import assert from 'node:assert/strict'
import test from 'node:test'
import { trackLazyMountedTab } from '@/hooks/use-lazy-mounted-tabs'

test('trackLazyMountedTab keeps the same set when the tab is already mounted', () => {
  const mounted = new Set(['jobs'])
  const next = trackLazyMountedTab(mounted, 'jobs')

  assert.equal(next, mounted)
  assert.deepEqual([...next], ['jobs'])
})

test('trackLazyMountedTab adds a tab the first time it becomes active', () => {
  const mounted = new Set(['jobs'])
  const next = trackLazyMountedTab(mounted, 'billing')

  assert.notEqual(next, mounted)
  assert.deepEqual([...next].sort(), ['billing', 'jobs'])
})

test('trackLazyMountedTab preserves previously mounted tabs', () => {
  const mounted = new Set(['jobs', 'billing'])
  const next = trackLazyMountedTab(mounted, 'photos')

  assert.deepEqual([...next].sort(), ['billing', 'jobs', 'photos'])
})