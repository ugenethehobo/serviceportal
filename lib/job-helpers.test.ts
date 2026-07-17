import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canCrewLeadReassignDispatch,
  canManageJobHelpers,
  canTeamMemberAccessJob,
  filterHelperCandidates,
  formatHelperSummary,
  isCrewLead,
  normalizeHelperProfileIds,
  resolveValidCrewLeadId,
  userLeadsCrew,
  MAX_JOB_HELPERS,
} from '@/lib/job-helpers'

describe('job-helpers / crew lead', () => {
  it('detects crew lead identity', () => {
    assert.equal(isCrewLead('u1', 'u1'), true)
    assert.equal(isCrewLead('u1', 'u2'), false)
    assert.equal(isCrewLead(null, 'u1'), false)
    assert.equal(userLeadsCrew(['a', 'b'], 'b'), true)
    assert.equal(userLeadsCrew(['a'], 'c'), false)
  })

  it('allows team access via crew match or helper flag', () => {
    assert.equal(
      canTeamMemberAccessJob({
        jobCrewId: 'crew-a',
        memberCrewId: 'crew-a',
        isHelper: false,
      }),
      true
    )
    assert.equal(
      canTeamMemberAccessJob({
        jobCrewId: 'crew-a',
        memberCrewId: 'crew-b',
        isHelper: true,
      }),
      true
    )
    assert.equal(
      canTeamMemberAccessJob({
        jobCrewId: 'crew-a',
        memberCrewId: 'crew-b',
        isHelper: false,
      }),
      false
    )
  })

  it('restricts helper management for solo and non-leads', () => {
    assert.equal(
      canManageJobHelpers({
        role: 'company_admin',
        isSoloBusiness: true,
        jobCrewId: 'c1',
        leadCrewIds: [],
      }),
      false
    )
    assert.equal(
      canManageJobHelpers({
        role: 'company_admin',
        isSoloBusiness: false,
        jobCrewId: 'c1',
        leadCrewIds: [],
      }),
      true
    )
    assert.equal(
      canManageJobHelpers({
        role: 'team_member',
        isSoloBusiness: false,
        jobCrewId: 'c1',
        leadCrewIds: ['c1'],
      }),
      true
    )
    assert.equal(
      canManageJobHelpers({
        role: 'team_member',
        isSoloBusiness: false,
        jobCrewId: 'c1',
        leadCrewIds: ['c2'],
      }),
      false
    )
  })

  it('limits crew lead reassign to own crew and unassigned', () => {
    assert.equal(
      canCrewLeadReassignDispatch({
        leadCrewId: 'mine',
        sourceCrewId: null,
        targetCrewId: 'mine',
      }),
      true
    )
    assert.equal(
      canCrewLeadReassignDispatch({
        leadCrewId: 'mine',
        sourceCrewId: 'mine',
        targetCrewId: null,
      }),
      true
    )
    assert.equal(
      canCrewLeadReassignDispatch({
        leadCrewId: 'mine',
        sourceCrewId: 'other',
        targetCrewId: 'mine',
      }),
      false
    )
    assert.equal(
      canCrewLeadReassignDispatch({
        leadCrewId: 'mine',
        sourceCrewId: 'mine',
        targetCrewId: 'other',
      }),
      false
    )
  })

  it('normalizes helper ids with cap and uniqueness', () => {
    assert.deepEqual(normalizeHelperProfileIds(['a', 'a', ' b ', '']), ['a', 'b'])
    const many = Array.from({ length: 20 }, (_, i) => `id-${i}`)
    assert.equal(normalizeHelperProfileIds(many).length, MAX_JOB_HELPERS)
  })

  it('filters helper candidates and formats summary', () => {
    const people = filterHelperCandidates(
      [
        { id: '1', full_name: 'Zoe', role: 'team_member' },
        { id: '2', full_name: 'Amy', role: 'client' },
        { id: '3', full_name: 'Bob', role: 'company_admin' },
      ],
      { excludeProfileIds: ['3'] }
    )
    assert.deepEqual(
      people.map((p) => p.id),
      ['1']
    )
    assert.equal(filterHelperCandidates(people, { isSoloBusiness: true }).length, 0)
    assert.equal(
      formatHelperSummary([{ fullName: 'Alice Smith' }, { fullName: 'Bob Jones' }]),
      'Alice, Bob'
    )
    assert.equal(
      formatHelperSummary([
        { fullName: 'A' },
        { fullName: 'B' },
        { fullName: 'C' },
      ]),
      'A, B +1'
    )
  })

  it('requires crew lead to be a selected member', () => {
    assert.equal(resolveValidCrewLeadId(['a', 'b'], 'b'), 'b')
    assert.equal(resolveValidCrewLeadId(['a', 'b'], 'c'), null)
    assert.equal(resolveValidCrewLeadId(['a'], null), null)
  })
})

describe('mergeTeamMemberDaySchedules', () => {
  it('keeps home-crew jobs and marks helper-only rows', async () => {
    const { mergeTeamMemberDaySchedules } = await import('@/lib/team-dashboard')
    const home = [
      {
        id: 's1',
        client_id: 'c1',
        title: 'Home',
        start_time: '2026-07-17T09:00:00.000Z',
        end_time: '2026-07-17T10:00:00.000Z',
        status: 'scheduled',
        client: null,
      },
    ]
    const helper = [
      {
        id: 's2',
        client_id: 'c2',
        title: 'Helper',
        start_time: '2026-07-17T11:00:00.000Z',
        end_time: '2026-07-17T12:00:00.000Z',
        status: 'scheduled',
        client: null,
      },
      {
        id: 's1',
        client_id: 'c1',
        title: 'Home',
        start_time: '2026-07-17T09:00:00.000Z',
        end_time: '2026-07-17T10:00:00.000Z',
        status: 'scheduled',
        client: null,
      },
    ]
    const { schedules, helperOnlyIds } = mergeTeamMemberDaySchedules(
      home as never,
      helper as never
    )
    assert.equal(schedules.length, 2)
    assert.equal(schedules[0].id, 's1')
    assert.equal(schedules[1].id, 's2')
    assert.equal(helperOnlyIds.has('s1'), false)
    assert.equal(helperOnlyIds.has('s2'), true)
  })
})
