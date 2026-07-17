import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getPasswordRequirementsHint,
  isValidNewPassword,
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from '@/lib/password-policy'

describe('password-policy', () => {
  it('rejects short or weak passwords', () => {
    assert.equal(isValidNewPassword(''), false)
    assert.equal(isValidNewPassword('short'), false)
    assert.equal(isValidNewPassword('longenough'), false) // no number
    assert.equal(isValidNewPassword('1234567890'), false) // no letter
    assert.equal(validatePassword('abc').checks.minLength, false)
  })

  it('accepts passwords with length, letter, and number', () => {
    assert.equal(isValidNewPassword('Password12'), true)
    assert.equal(isValidNewPassword('securepass9'), true)
    assert.equal(validatePassword('Password12').ok, true)
  })

  it('returns a clear requirements hint', () => {
    assert.match(getPasswordRequirementsHint(), new RegExp(String(PASSWORD_MIN_LENGTH)))
    assert.equal(
      validatePassword('!!!!!!!!!!').error,
      'Password must include at least one letter'
    )
    assert.equal(
      validatePassword('lettersonly').error,
      'Password must include at least one number'
    )
  })
})
