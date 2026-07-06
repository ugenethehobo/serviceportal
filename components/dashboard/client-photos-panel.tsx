'use client'

import { FolderPhotosPanel } from '@/components/dashboard/folder-photos-panel'
import type { JobPhotoWithUrl } from '@/lib/job-photos'

type PhotoJobMeta = { id: string; title: string; start_time: string; status: string }

interface ClientPhotosPanelProps {
  clientId: string
  refreshKey?: number
  variant?: 'staff' | 'portal'
  initialPhotos?: JobPhotoWithUrl[]
  initialJobs?: PhotoJobMeta[]
  initialCategories?: string[]
}

export function ClientPhotosPanel({
  clientId,
  refreshKey = 0,
  variant = 'staff',
  initialPhotos,
  initialJobs,
  initialCategories,
}: ClientPhotosPanelProps) {
  if (variant === 'portal') {
    return (
      <FolderPhotosPanel
        clientId={clientId}
        variant="portal"
        refreshKey={refreshKey}
        initialPhotos={initialPhotos}
        initialJobs={initialJobs}
        initialCategories={initialCategories}
        title="Photos"
        description="Job site photos from your visits — organized by job and category."
      />
    )
  }

  return (
    <FolderPhotosPanel
      clientId={clientId}
      refreshKey={refreshKey}
      initialPhotos={initialPhotos}
      initialJobs={initialJobs}
      initialCategories={initialCategories}
      title="Job Photos"
      description="Every job site photo for this client, organized by visit and category folder."
    />
  )
}