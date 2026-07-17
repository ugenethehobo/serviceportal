import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canTeamMemberAccessCrewJob,
  getAvailableFieldJobAction,
  getFieldJobTargetStatus,
} from '@/lib/field-job-access'

describe('field-job-access', () => {
  it('requires matching crew ids for team member access', () => {
    assert.equal(canTeamMemberAccessCrewJob('crew-a', 'crew-a'), true)
    assert.equal(canTeamMemberAccessCrewJob('crew-a', 'crew-b'), false)
    assert.equal(canTeamMemberAccessCrewJob(null, 'crew-a'), false)
    assert.equal(canTeamMemberAccessCrewJob('crew-a', null), false)
    assert.equal(canTeamMemberAccessCrewJob(null, null), false)
  })

  it('maps statuses to field actions', () => {
    assert.equal(getAvailableFieldJobAction('scheduled'), 'start')
    assert.equal(getAvailableFieldJobAction('in_progress'), 'complete')
    assert.equal(getAvailableFieldJobAction('archived'), null)
    assert.equal(getAvailableFieldJobAction('cancelled'), null)
  })

  it('maps actions to target statuses', () => {
    assert.equal(getFieldJobTargetStatus('start'), 'in_progress')
    assert.equal(getFieldJobTargetStatus('complete'), 'archived')
  })
})
