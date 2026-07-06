import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatPhotoStorageBytes,
  getPhotoStorageFullMessage,
  getPhotoStorageLimitForPlan,
  getPhotoStorageUpgradeMessage,
  getPhotoStorageUsagePercent,
  PLATFORM_PHOTO_STORAGE_BYTES,
  wouldExceedPhotoStorage,
} from '@/lib/job-photo-storage'

describe('job photo storage', () => {
  it('defines tier limits', () => {
    assert.equal(PLATFORM_PHOTO_STORAGE_BYTES.trial, 50 * 1024 * 1024)
    assert.equal(PLATFORM_PHOTO_STORAGE_BYTES.basic, 3 * 1024 * 1024 * 1024)
    assert.equal(PLATFORM_PHOTO_STORAGE_BYTES.pro, 15 * 1024 * 1024 * 1024)
  })

  it('formats bytes for display', () => {
    assert.equal(formatPhotoStorageBytes(50 * 1024 * 1024), '50 MB')
    assert.equal(formatPhotoStorageBytes(3 * 1024 * 1024 * 1024), '3.0 GB')
    assert.equal(formatPhotoStorageBytes(15 * 1024 * 1024 * 1024), '15 GB')
  })

  it('calculates usage percent capped at 100', () => {
    assert.equal(getPhotoStorageUsagePercent(0, 100), 0)
    assert.equal(getPhotoStorageUsagePercent(50, 100), 50)
    assert.equal(getPhotoStorageUsagePercent(150, 100), 100)
  })

  it('detects when an upload would exceed quota', () => {
    const limit = getPhotoStorageLimitForPlan('trial')
    assert.equal(wouldExceedPhotoStorage(limit - 1000, limit, 500), false)
    assert.equal(wouldExceedPhotoStorage(limit - 1000, limit, 2000), true)
  })

  it('provides upgrade and full messages by plan', () => {
    assert.match(getPhotoStorageUpgradeMessage('trial'), /50 MB/)
    assert.match(getPhotoStorageUpgradeMessage('basic'), /3 GB/)
    assert.match(getPhotoStorageFullMessage('pro'), /15 GB/)
  })
})