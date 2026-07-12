import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const actionSource = readFileSync(join(process.cwd(), 'app', 'action.ts'), 'utf8')

const LEGACY_ADMIN_ACTIONS = [
  'createCompanyUser',
  'getCompanyData',
  'getDashboardData',
  'updateCompanyUser',
  'deleteUserCompletely',
] as const

const STAFF_MUTATION_ACTIONS = [
  'createClientAction',
  'updateClientAction',
  'createJobAction',
  'updateJobAction',
  'cancelJobAction',
  'archiveJobAction',
  'deleteJobAction',
  'updateCrew',
  'deleteCrew',
  'getJobAction',
  'getJobBillingAction',
  'getClientBillingAction',
  'addBillingLineItemAction',
  'createEstimateAction',
  'getClientEstimatesAction',
] as const

function extractFunctionBody(actionName: string): string {
  const marker = `export async function ${actionName}`
  const start = actionSource.indexOf(marker)
  assert.ok(start >= 0, `missing export ${actionName}`)

  const parenClose = actionSource.indexOf(')', start)
  assert.ok(parenClose >= 0, `missing signature close for ${actionName}`)

  const openBrace = actionSource.indexOf('{', parenClose)
  assert.ok(openBrace >= 0, `missing body for ${actionName}`)

  let depth = 0
  for (let index = openBrace; index < actionSource.length; index += 1) {
    const char = actionSource[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return actionSource.slice(openBrace, index + 1)
      }
    }
  }

  throw new Error(`unterminated body for ${actionName}`)
}

function bodyIncludesAuthGuard(body: string): boolean {
  return (
    body.includes('assertPlatformAdmin()') ||
    body.includes('verifyCompanyStaff()') ||
    body.includes('verifyClientForStaff(') ||
    body.includes('verifyClientCompanyAccess(') ||
    body.includes('verifyScheduleCompanyAccess(') ||
    body.includes('verifyEstimateCompanyAccess(') ||
    body.includes('verifyCrewCompanyAccess(') ||
    body.includes('verifyCompanyAdminForClient(') ||
    body.includes('getSessionProfile()')
  )
}

describe('server action auth guards', () => {
  it('requires platform admin on legacy admin actions', () => {
    for (const actionName of LEGACY_ADMIN_ACTIONS) {
      const body = extractFunctionBody(actionName)
      assert.match(
        body,
        /assertPlatformAdmin\(\)/,
        `${actionName} should call assertPlatformAdmin()`
      )
    }
  })

  it('requires staff or scoped access on tenant mutation actions', () => {
    for (const actionName of STAFF_MUTATION_ACTIONS) {
      const body = extractFunctionBody(actionName)
      assert.ok(
        bodyIncludesAuthGuard(body),
        `${actionName} should include a session auth guard`
      )
    }
  })

  it('keeps verifyScheduleOwnership internal to company access helper', () => {
    const matches = [...actionSource.matchAll(/verifyScheduleOwnership\(/g)]
    assert.equal(matches.length, 2, 'verifyScheduleOwnership should only be used in its helper')
  })
})