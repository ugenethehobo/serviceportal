import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildDispatchBoardData,
  DISPATCH_UNASSIGNED_COLUMN_ID,
  getDispatchCrewColumnLabel,
  getDispatchDisplayStatus,
  markDispatchCrewConflicts,
  resolveDispatchTargetCrewId,
  type DispatchJobCard,
} from '@/lib/dispatch-board'
import { SOLO_CREW_NAME } from '@/lib/company-operations'

function makeJob(
  overrides: Partial<DispatchJobCard> & Pick<DispatchJobCard, 'id' | 'crewId'>
): DispatchJobCard {
  return {
    clientId: 'client-1',
    title: 'Job',
    clientName: 'Client',
    location: null,
    startTime: '2026-07-17T14:00:00.000Z',
    endTime: '2026-07-17T15:00:00.000Z',
    startLabel: '9:00 AM',
    endLabel: '10:00 AM',
    status: 'scheduled',
    displayStatus: 'Scheduled',
    hasCrewConflict: false,
    href: '/dashboard/clients/client-1/jobs/job-1',
    draggable: true,
    ...overrides,
  }
}

describe('dispatch-board', () => {
  it('labels solo crew column as You', () => {
    assert.equal(getDispatchCrewColumnLabel(true, SOLO_CREW_NAME), 'You')
    assert.equal(getDispatchCrewColumnLabel(false, 'Alpha'), 'Alpha')
  })

  it('marks overlapping jobs on the same crew as conflicts', () => {
    const jobs = markDispatchCrewConflicts([
      makeJob({
        id: 'a',
        crewId: 'crew-1',
        startTime: '2026-07-17T14:00:00.000Z',
        endTime: '2026-07-17T16:00:00.000Z',
      }),
      makeJob({
        id: 'b',
        crewId: 'crew-1',
        startTime: '2026-07-17T15:00:00.000Z',
        endTime: '2026-07-17T17:00:00.000Z',
      }),
      makeJob({
        id: 'c',
        crewId: 'crew-2',
        startTime: '2026-07-17T15:00:00.000Z',
        endTime: '2026-07-17T17:00:00.000Z',
      }),
    ])

    assert.equal(jobs.find((j) => j.id === 'a')?.hasCrewConflict, true)
    assert.equal(jobs.find((j) => j.id === 'b')?.hasCrewConflict, true)
    assert.equal(jobs.find((j) => j.id === 'c')?.hasCrewConflict, false)
  })

  it('builds unassigned + crew columns and puts orphan crew jobs in unassigned', () => {
    const board = buildDispatchBoardData({
      schedules: [
        {
          id: 'job-1',
          title: 'Unassigned visit',
          start_time: '2026-07-17T15:00:00.000Z',
          end_time: '2026-07-17T16:00:00.000Z',
          status: 'scheduled',
          crew_id: null,
          client_id: 'c1',
          client: { id: 'c1', name: 'Acme' },
        },
        {
          id: 'job-2',
          title: 'Crew job',
          start_time: '2026-07-17T17:00:00.000Z',
          end_time: '2026-07-17T18:00:00.000Z',
          status: 'scheduled',
          crew_id: 'crew-1',
          client_id: 'c2',
          client: { id: 'c2', name: 'Beta' },
        },
        {
          id: 'job-3',
          title: 'Missing crew',
          start_time: '2026-07-17T19:00:00.000Z',
          end_time: '2026-07-17T20:00:00.000Z',
          status: 'scheduled',
          crew_id: 'deleted-crew',
          client_id: 'c3',
          client: { id: 'c3', name: 'Gamma' },
        },
      ],
      crews: [{ id: 'crew-1', name: 'Alpha' }],
      dayOffset: 0,
      dayLabel: 'Friday, Jul 17',
      dateStr: '2026-07-17',
      timezone: 'America/Chicago',
      isSoloBusiness: false,
      soloCrewId: null,
      now: new Date('2026-07-17T12:00:00.000Z'),
    })

    assert.equal(board.columns[0]?.id, DISPATCH_UNASSIGNED_COLUMN_ID)
    assert.equal(board.unassignedCount, 2)
    assert.equal(board.columns[1]?.jobs.map((j) => j.id).join(','), 'job-2')
  })

  it('solo mode shows only owner column labeled You', () => {
    const board = buildDispatchBoardData({
      schedules: [
        {
          id: 'job-1',
          title: 'Owner job',
          start_time: '2026-07-17T15:00:00.000Z',
          end_time: '2026-07-17T16:00:00.000Z',
          status: 'scheduled',
          crew_id: 'solo-1',
          client_id: 'c1',
          client: { id: 'c1', name: 'Acme' },
        },
      ],
      crews: [
        { id: 'solo-1', name: SOLO_CREW_NAME },
        { id: 'extra', name: 'Should hide' },
      ],
      dayOffset: 0,
      dayLabel: 'Friday, Jul 17',
      dateStr: '2026-07-17',
      timezone: 'America/Chicago',
      isSoloBusiness: true,
      soloCrewId: 'solo-1',
      now: new Date('2026-07-17T12:00:00.000Z'),
    })

    assert.equal(board.columns.length, 2)
    assert.equal(board.columns[1]?.id, 'solo-1')
    assert.equal(board.columns[1]?.name, 'You')
  })

  it('resolves drop targets for solo and multi-crew', () => {
    assert.equal(resolveDispatchTargetCrewId(DISPATCH_UNASSIGNED_COLUMN_ID), null)
    assert.equal(resolveDispatchTargetCrewId('crew-a'), 'crew-a')
    assert.equal(
      resolveDispatchTargetCrewId('other', {
        isSoloBusiness: true,
        soloCrewId: 'solo-1',
      }),
      'solo-1'
    )
  })

  it('classifies completed status by end time', () => {
    assert.equal(
      getDispatchDisplayStatus(
        'scheduled',
        '2026-07-17T10:00:00.000Z',
        '2026-07-17T11:00:00.000Z',
        new Date('2026-07-17T12:00:00.000Z')
      ),
      'Completed'
    )
  })
})
