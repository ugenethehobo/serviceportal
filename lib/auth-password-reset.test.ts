import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPasswordResetVerifyUrl,
  getPasswordResetRedirectUrl,
  isValidNewPassword,
  PASSWORD_RESET_NEXT_PATH,
} from './auth-password-reset.ts'

test('getPasswordResetRedirectUrl builds callback with reset next path', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
  const url = getPasswordResetRedirectUrl()
  assert.equal(
    url,
    `https://app.example.com/auth/callback?next=${encodeURIComponent(PASSWORD_RESET_NEXT_PATH)}`
  )
})

test('buildPasswordResetVerifyUrl includes recovery token and next path', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
  const url = new URL(buildPasswordResetVerifyUrl('abc123hash'))
  assert.equal(url.origin + url.pathname, 'https://app.example.com/auth/callback')
  assert.equal(url.searchParams.get('token_hash'), 'abc123hash')
  assert.equal(url.searchParams.get('type'), 'recovery')
  assert.equal(url.searchParams.get('next'), PASSWORD_RESET_NEXT_PATH)
})

test('isValidNewPassword enforces shared password policy', () => {
  assert.equal(isValidNewPassword('short'), false)
  assert.equal(isValidNewPassword('longenough'), false)
  assert.equal(isValidNewPassword('Password12'), true)
})
