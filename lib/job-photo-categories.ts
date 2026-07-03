export const DEFAULT_JOB_PHOTO_CATEGORIES = [
  'Before',
  'After',
  'Damage',
  'Equipment',
  'Other',
] as const

export type JobPhotoCategory = string

export function normalizeJobPhotoCategories(
  input: unknown
): JobPhotoCategory[] {
  if (!Array.isArray(input)) return [...DEFAULT_JOB_PHOTO_CATEGORIES]

  const seen = new Set<string>()
  const categories: JobPhotoCategory[] = []

  for (const entry of input) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    categories.push(trimmed)
  }

  return categories.length > 0 ? categories : [...DEFAULT_JOB_PHOTO_CATEGORIES]
}

export function validateJobPhotoCategories(
  categories: JobPhotoCategory[]
): { valid: true } | { valid: false; error: string } {
  if (categories.length === 0) {
    return { valid: false, error: 'Add at least one photo category' }
  }

  if (categories.length > 20) {
    return { valid: false, error: 'Use 20 categories or fewer' }
  }

  for (const category of categories) {
    if (category.length > 40) {
      return { valid: false, error: 'Each category must be 40 characters or fewer' }
    }
  }

  return { valid: true }
}

export function normalizePhotoCategory(
  category: string | null | undefined,
  available: JobPhotoCategory[]
): JobPhotoCategory | null {
  const trimmed = category?.trim()
  if (!trimmed) return null

  const match = available.find(
    (entry) => entry.toLowerCase() === trimmed.toLowerCase()
  )
  return match ?? null
}