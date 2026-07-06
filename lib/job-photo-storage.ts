import type { PlatformPlanId } from '@/lib/platform-billing'

export const PLATFORM_PHOTO_STORAGE_BYTES: Record<PlatformPlanId, number> = {
  trial: 50 * 1024 * 1024,
  basic: 3 * 1024 * 1024 * 1024,
  pro: 15 * 1024 * 1024 * 1024,
}

export function getPhotoStorageLimitForPlan(plan: PlatformPlanId): number {
  return PLATFORM_PHOTO_STORAGE_BYTES[plan]
}

export function formatPhotoStorageBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`
  }
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024)
    return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${bytes} B`
}

export function getPhotoStorageUsagePercent(used: number, limit: number): number {
  if (limit <= 0) return 100
  return Math.min(100, Math.round((used / limit) * 100))
}

export function getPhotoStorageUpgradeMessage(plan: PlatformPlanId): string {
  if (plan === 'trial') {
    return 'Your Free Trial includes 50 MB of job photo storage. Upgrade to Basic for 3 GB or Pro for 15 GB.'
  }
  if (plan === 'basic') {
    return 'Your Basic plan includes 3 GB of job photo storage. Upgrade to Pro for 15 GB.'
  }
  return 'Your Pro plan includes 15 GB of job photo storage.'
}

export function getPhotoStorageFullMessage(plan: PlatformPlanId): string {
  const limitLabel = formatPhotoStorageBytes(getPhotoStorageLimitForPlan(plan))
  if (plan === 'pro') {
    return `You have used all ${limitLabel} of job photo storage on your Pro plan. Delete older photos to free space.`
  }
  return `You have used all ${limitLabel} of job photo storage. Delete photos or upgrade your plan for more space.`
}

export function wouldExceedPhotoStorage(
  usedBytes: number,
  limitBytes: number,
  additionalBytes: number
): boolean {
  return usedBytes + additionalBytes > limitBytes
}