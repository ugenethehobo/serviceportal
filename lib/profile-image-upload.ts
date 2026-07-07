export const PROFILE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
export const PROFILE_IMAGE_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export const PROFILE_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const PROFILE_IMAGE_MAX_SIZE_LABEL = '10 MB'

export function validateProfileImageFile(file: File): string | null {
  if (!PROFILE_IMAGE_ACCEPTED_TYPES.includes(file.type as (typeof PROFILE_IMAGE_ACCEPTED_TYPES)[number])) {
    return 'Use a JPG, PNG, WebP, or GIF image.'
  }

  if (file.size > PROFILE_IMAGE_MAX_BYTES) {
    return `Image must be ${PROFILE_IMAGE_MAX_SIZE_LABEL} or smaller.`
  }

  return null
}

export function profileImageIdleDescription(): string {
  return `JPG, PNG, WebP, or GIF · max ${PROFILE_IMAGE_MAX_SIZE_LABEL}`
}