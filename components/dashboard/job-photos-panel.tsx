'use client'

import { FolderPhotosPanel } from '@/components/dashboard/folder-photos-panel'

interface JobPhotosPanelProps {
  scheduleId: string
  clientId: string
}

export function JobPhotosPanel({ scheduleId, clientId }: JobPhotosPanelProps) {
  return (
    <FolderPhotosPanel
      clientId={clientId}
      scheduleId={scheduleId}
      title="Job Photos"
      description="Job site photos for this visit, grouped by category folder."
    />
  )
}