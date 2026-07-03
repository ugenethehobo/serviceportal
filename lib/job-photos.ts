export const JOB_PHOTO_BUCKET = 'job-photos'

export const JOB_PHOTO_ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const JOB_PHOTO_MAX_BYTES = 10 * 1024 * 1024

export type JobPhoto = {
  id: string
  schedule_id: string
  client_id: string
  company_id: string
  storage_path: string
  file_name: string
  content_type: string
  file_size: number
  caption: string | null
  category: string | null
  uploaded_by: string | null
  created_at: string
}

export type JobPhotoWithUrl = JobPhoto & {
  url: string
}