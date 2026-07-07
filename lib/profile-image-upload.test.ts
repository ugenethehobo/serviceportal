import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PROFILE_IMAGE_MAX_BYTES,
  validateProfileImageFile,
} from './profile-image-upload.ts'

test('validateProfileImageFile rejects unsupported types', () => {
  const file = { type: 'application/pdf', size: 1024 } as File
  assert.match(validateProfileImageFile(file)!, /JPG, PNG, WebP, or GIF/)
})

test('validateProfileImageFile rejects files over 10 MB', () => {
  const file = { type: 'image/png', size: PROFILE_IMAGE_MAX_BYTES + 1 } as File
  assert.match(validateProfileImageFile(file)!, /10 MB/)
})

test('validateProfileImageFile accepts valid images', () => {
  const file = { type: 'image/jpeg', size: PROFILE_IMAGE_MAX_BYTES } as File
  assert.equal(validateProfileImageFile(file), null)
})