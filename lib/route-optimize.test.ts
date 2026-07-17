import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildOptimizedSchedule,
  canOptimizeCrewDay,
  getMovableOptimizeStops,
  haversineMeters,
  jobDurationMinutes,
  nearestNeighborOrder,
  orderIdsByIndices,
  packJobsInOrder,
  type RouteOptimizeStop,
} from '@/lib/route-optimize'

function stop(
  overrides: Partial<RouteOptimizeStop> & Pick<RouteOptimizeStop, 'id'>
): RouteOptimizeStop {
  return {
    latitude: 30.0,
    longitude: -97.0,
    startTime: '2026-07-16T14:00:00.000Z',
    endTime: '2026-07-16T15:00:00.000Z',
    status: 'scheduled',
    ...overrides,
  }
}

describe('route-optimize', () => {
  it('only treats scheduled jobs with coordinates as movable', () => {
    const stops = [
      stop({ id: 'a', status: 'scheduled' }),
      stop({ id: 'b', status: 'in_progress' }),
      stop({ id: 'c', status: 'scheduled', latitude: NaN }),
      stop({ id: 'd', status: 'archived' }),
    ]
    assert.deepEqual(
      getMovableOptimizeStops(stops).map((s) => s.id),
      ['a']
    )
    assert.equal(canOptimizeCrewDay(stops), false)
    assert.equal(
      canOptimizeCrewDay([stop({ id: 'a' }), stop({ id: 'b', latitude: 30.1 })]),
      true
    )
  })

  it('computes duration with a 15-minute floor', () => {
    assert.equal(
      jobDurationMinutes('2026-07-16T14:00:00.000Z', '2026-07-16T15:30:00.000Z'),
      90
    )
    assert.equal(
      jobDurationMinutes('2026-07-16T14:00:00.000Z', '2026-07-16T14:05:00.000Z'),
      15
    )
  })

  it('orders by nearest neighbor from a depot', () => {
    // Depot at origin; B is closer than A; C is east of B
    const order = nearestNeighborOrder(
      [
        { id: 'a', latitude: 0, longitude: 2 },
        { id: 'b', latitude: 0, longitude: 1 },
        { id: 'c', latitude: 0, longitude: 3 },
      ],
      { latitude: 0, longitude: 0 }
    )
    assert.deepEqual(order, ['b', 'a', 'c'])
  })

  it('haversine is symmetric and zero for same point', () => {
    const a = { latitude: 30.27, longitude: -97.74 }
    const b = { latitude: 30.3, longitude: -97.7 }
    assert.equal(haversineMeters(a, a), 0)
    assert.ok(Math.abs(haversineMeters(a, b) - haversineMeters(b, a)) < 0.01)
    assert.ok(haversineMeters(a, b) > 1000)
  })

  it('maps OSRM indices to ids and falls back on bad indices', () => {
    assert.deepEqual(orderIdsByIndices(['a', 'b', 'c'], [2, 0, 1]), ['c', 'a', 'b'])
    assert.deepEqual(orderIdsByIndices(['a', 'b'], [0, 0]), ['a', 'b'])
  })

  it('packs jobs preserving duration and travel buffer', () => {
    const packed = packJobsInOrder(
      [
        {
          id: 'a',
          startTime: '2026-07-16T15:00:00.000Z',
          endTime: '2026-07-16T16:00:00.000Z',
        },
        {
          id: 'b',
          startTime: '2026-07-16T14:00:00.000Z',
          endTime: '2026-07-16T14:30:00.000Z',
        },
      ],
      ['b', 'a'],
      { travelBufferMinutes: 15 }
    )

    assert.equal(packed.length, 2)
    // Earliest original start among ordered is b at 14:00
    assert.equal(packed[0].id, 'b')
    assert.equal(packed[0].startTime, '2026-07-16T14:00:00.000Z')
    assert.equal(packed[0].endTime, '2026-07-16T14:30:00.000Z')
    // 15 min buffer after b ends → a starts 14:45, duration 60 → 15:45
    assert.equal(packed[1].id, 'a')
    assert.equal(packed[1].startTime, '2026-07-16T14:45:00.000Z')
    assert.equal(packed[1].endTime, '2026-07-16T15:45:00.000Z')
  })

  it('buildOptimizedSchedule skips non-movable jobs', () => {
    const packed = buildOptimizedSchedule(
      [
        stop({
          id: 'a',
          latitude: 0,
          longitude: 2,
          startTime: '2026-07-16T15:00:00.000Z',
          endTime: '2026-07-16T16:00:00.000Z',
        }),
        stop({
          id: 'b',
          latitude: 0,
          longitude: 1,
          startTime: '2026-07-16T14:00:00.000Z',
          endTime: '2026-07-16T14:30:00.000Z',
        }),
        stop({
          id: 'busy',
          status: 'in_progress',
          latitude: 0,
          longitude: 0.5,
        }),
      ],
      ['a', 'b', 'busy'],
      0
    )

    assert.deepEqual(
      packed.map((p) => p.id),
      ['a', 'b']
    )
  })
})
