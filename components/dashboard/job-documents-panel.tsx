'use client'

import { UploadedDocumentsPanel } from '@/components/dashboard/uploaded-documents-panel'

interface JobDocumentsPanelProps {
  scheduleId: string
  clientId: string
}

export function JobDocumentsPanel({ scheduleId, clientId }: JobDocumentsPanelProps) {
  return (
    <UploadedDocumentsPanel
      clientId={clientId}
      scheduleId={scheduleId}
      variant="staff"
    />
  )
}